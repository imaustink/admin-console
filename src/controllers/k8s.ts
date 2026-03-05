import * as k8s from '@kubernetes/client-node';
import { K8sNode, K8sHealthCheckResult, K8sConfig } from '../types';
import logger from '../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class K8sController {
  private kc: k8s.KubeConfig;
  private k8sApi: k8s.CoreV1Api;
  private appsApi: k8s.AppsV1Api;
  private sshConfig?: K8sConfig['ssh'];

  constructor(config?: K8sConfig) {
    this.sshConfig = config?.ssh;
    this.kc = new k8s.KubeConfig();
    
    if (config && config.cluster && config.token) {
      // Use token-based authentication
      logger.info('Initializing K8s with token-based authentication');
      
      // Convert single cluster to array for unified handling
      const clusterAddresses = Array.isArray(config.cluster) ? config.cluster : [config.cluster];
      
      // Try each cluster address until one succeeds
      let connected = false;
      let lastError: Error | null = null;
      
      for (let i = 0; i < clusterAddresses.length; i++) {
        const clusterUrl = clusterAddresses[i];
        logger.info(`Attempting to connect to K8s cluster ${i + 1}/${clusterAddresses.length}: ${clusterUrl}`);
        
        try {
          const cluster: k8s.Cluster = {
            name: 'custom-cluster',
            server: clusterUrl,
            skipTLSVerify: config.skipTLSVerify || false,
            caData: config.caData,
          };
          
          const user: k8s.User = {
            name: 'service-account',
            token: config.token,
          };
          
          const context: k8s.Context = {
            name: 'custom-context',
            cluster: cluster.name,
            user: user.name,
          };
          
          this.kc.loadFromOptions({
            clusters: [cluster],
            users: [user],
            contexts: [context],
            currentContext: context.name,
          });
          
          logger.info(`Successfully configured K8s client for: ${clusterUrl}`);
          connected = true;
          break;
        } catch (error: any) {
          logger.warn(`Failed to configure K8s client for ${clusterUrl}: ${error.message}`);
          lastError = error;
          // Continue to next cluster address
        }
      }
      
      if (!connected) {
        logger.error('Failed to connect to any K8s cluster address');
        if (lastError) {
          throw lastError;
        }
      }
    } else {
      // Use default kubeconfig
      logger.info('Initializing K8s with default kubeconfig');
      this.kc.loadFromDefault();
    }
    
    this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
    this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);
  }

  async getNodes(): Promise<K8sNode[]> {
    try {
      logger.info('Fetching Kubernetes nodes...');
      const response = await this.k8sApi.listNode();
      
      const nodes: K8sNode[] = response.body.items.map(node => {
        const status = node.status?.conditions?.find(c => c.type === 'Ready');
        const addresses = node.status?.addresses || [];
        const internalIP = addresses.find(a => a.type === 'InternalIP')?.address;
        
        return {
          name: node.metadata?.name || 'unknown',
          ip: internalIP,
          status: status?.status === 'True' ? 'Ready' : 'NotReady',
          os: node.status?.nodeInfo?.osImage,
          kernel: node.status?.nodeInfo?.kernelVersion,
          containerRuntime: node.status?.nodeInfo?.containerRuntimeVersion,
          kubeletVersion: node.status?.nodeInfo?.kubeletVersion,
          schedulable: !node.spec?.unschedulable,
        };
      });

      logger.info(`Found ${nodes.length} Kubernetes nodes`);
      return nodes;
    } catch (error: any) {
      logger.error('Failed to get Kubernetes nodes:', error.message);
      throw new Error(`Failed to get nodes: ${error.message}`);
    }
  }

  async drainNode(nodeName: string): Promise<void> {
    try {
      logger.info(`Draining node ${nodeName}...`);
      
      // Cordon the node first
      await this.cordonNode(nodeName);
      
      // Get all pods on the node
      const pods = await this.k8sApi.listPodForAllNamespaces(
        undefined,
        undefined,
        `spec.nodeName=${nodeName}`
      );

      // Delete each pod (respecting PodDisruptionBudgets would require more complex logic)
      for (const pod of pods.body.items) {
        if (pod.metadata?.namespace && pod.metadata?.name) {
          try {
            await this.k8sApi.deleteNamespacedPod(
              pod.metadata.name,
              pod.metadata.namespace,
              undefined,
              undefined,
              30 // grace period
            );
            logger.info(`Deleted pod ${pod.metadata.namespace}/${pod.metadata.name}`);
          } catch (error: any) {
            logger.warn(`Failed to delete pod ${pod.metadata.namespace}/${pod.metadata.name}:`, error.message);
          }
        }
      }

      logger.info(`Successfully drained node ${nodeName}`);
    } catch (error: any) {
      logger.error(`Failed to drain node ${nodeName}:`, error.message);
      throw new Error(`Failed to drain node: ${error.message}`);
    }
  }

  async cordonNode(nodeName: string): Promise<void> {
    try {
      logger.info(`Cordoning node ${nodeName}...`);
      await this.k8sApi.patchNode(
        nodeName,
        {
          spec: {
            unschedulable: true,
          },
        },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          headers: { 'Content-Type': 'application/strategic-merge-patch+json' },
        }
      );
      logger.info(`Successfully cordoned node ${nodeName}`);
    } catch (error: any) {
      logger.error(`Failed to cordon node ${nodeName}:`, error.message);
      throw new Error(`Failed to cordon node: ${error.message}`);
    }
  }

  async uncordonNode(nodeName: string): Promise<void> {
    try {
      logger.info(`Uncordoning node ${nodeName}...`);
      await this.k8sApi.patchNode(
        nodeName,
        {
          spec: {
            unschedulable: false,
          },
        },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          headers: { 'Content-Type': 'application/strategic-merge-patch+json' },
        }
      );
      logger.info(`Successfully uncordoned node ${nodeName}`);
    } catch (error: any) {
      logger.error(`Failed to uncordon node ${nodeName}:`, error.message);
      throw new Error(`Failed to uncordon node: ${error.message}`);
    }
  }

  async checkResourceHealth(
    kind: 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Pod' | 'Service',
    name: string,
    namespace: string = 'default'
  ): Promise<K8sHealthCheckResult> {
    const startTime = Date.now();
    
    try {
      let result: K8sHealthCheckResult;
      
      switch (kind) {
        case 'Deployment':
          result = await this.checkDeploymentHealth(name, namespace);
          break;
        case 'StatefulSet':
          result = await this.checkStatefulSetHealth(name, namespace);
          break;
        case 'DaemonSet':
          result = await this.checkDaemonSetHealth(name, namespace);
          break;
        case 'Pod':
          result = await this.checkPodHealth(name, namespace);
          break;
        case 'Service':
          result = await this.checkServiceHealth(name, namespace);
          break;
        default:
          throw new Error(`Unsupported resource kind: ${kind}`);
      }

      result.responseTime = Date.now() - startTime;
      logger.info(`Health check for ${kind}/${namespace}/${name}: ${result.status}`);
      return result;
    } catch (error: any) {
      logger.error(`Failed to check health for ${kind}/${namespace}/${name}:`, error.message);
      return {
        kind,
        name,
        namespace,
        status: 'unknown',
        message: error.message,
        responseTime: Date.now() - startTime,
      };
    }
  }

  private async checkDeploymentHealth(name: string, namespace: string): Promise<K8sHealthCheckResult> {
    const deployment = await this.appsApi.readNamespacedDeployment(name, namespace);
    const spec = deployment.body.spec;
    const status = deployment.body.status;

    const desired = spec?.replicas || 0;
    const ready = status?.readyReplicas || 0;
    const available = status?.availableReplicas || 0;

    let healthStatus: 'healthy' | 'unhealthy' | 'degraded' | 'unknown' = 'healthy';
    let message = `${ready}/${desired} replicas ready`;

    if (ready === 0) {
      healthStatus = 'unhealthy';
      message = 'No replicas ready';
    } else if (ready < desired) {
      healthStatus = 'degraded';
      message = `Only ${ready}/${desired} replicas ready`;
    } else if (available < desired) {
      healthStatus = 'degraded';
      message = `${ready} ready but only ${available} available`;
    }

    return {
      kind: 'Deployment',
      name,
      namespace,
      status: healthStatus,
      message,
      replicas: { desired, ready, available },
    };
  }

  private async checkStatefulSetHealth(name: string, namespace: string): Promise<K8sHealthCheckResult> {
    const statefulSet = await this.appsApi.readNamespacedStatefulSet(name, namespace);
    const spec = statefulSet.body.spec;
    const status = statefulSet.body.status;

    const desired = spec?.replicas || 0;
    const ready = status?.readyReplicas || 0;
    const current = status?.currentReplicas || 0;

    let healthStatus: 'healthy' | 'unhealthy' | 'degraded' | 'unknown' = 'healthy';
    let message = `${ready}/${desired} replicas ready`;

    if (ready === 0) {
      healthStatus = 'unhealthy';
      message = 'No replicas ready';
    } else if (ready < desired) {
      healthStatus = 'degraded';
      message = `Only ${ready}/${desired} replicas ready`;
    } else if (current < desired) {
      healthStatus = 'degraded';
      message = `${ready} ready but only ${current} current`;
    }

    return {
      kind: 'StatefulSet',
      name,
      namespace,
      status: healthStatus,
      message,
      replicas: { desired, ready, available: current },
    };
  }

  private async checkDaemonSetHealth(name: string, namespace: string): Promise<K8sHealthCheckResult> {
    const daemonSet = await this.appsApi.readNamespacedDaemonSet(name, namespace);
    const status = daemonSet.body.status;

    const desired = status?.desiredNumberScheduled || 0;
    const ready = status?.numberReady || 0;
    const available = status?.numberAvailable || 0;

    let healthStatus: 'healthy' | 'unhealthy' | 'degraded' | 'unknown' = 'healthy';
    let message = `${ready}/${desired} pods ready`;

    if (ready === 0) {
      healthStatus = 'unhealthy';
      message = 'No pods ready';
    } else if (ready < desired) {
      healthStatus = 'degraded';
      message = `Only ${ready}/${desired} pods ready`;
    } else if (available < desired) {
      healthStatus = 'degraded';
      message = `${ready} ready but only ${available} available`;
    }

    return {
      kind: 'DaemonSet',
      name,
      namespace,
      status: healthStatus,
      message,
      replicas: { desired, ready, available },
    };
  }

  private async checkPodHealth(name: string, namespace: string): Promise<K8sHealthCheckResult> {
    const pod = await this.k8sApi.readNamespacedPod(name, namespace);
    const status = pod.body.status;
    const phase = status?.phase || 'Unknown';

    let healthStatus: 'healthy' | 'unhealthy' | 'degraded' | 'unknown' = 'unknown';
    let message = `Phase: ${phase}`;

    switch (phase) {
      case 'Running':
        // Check if all containers are ready
        const containerStatuses = status?.containerStatuses || [];
        const allReady = containerStatuses.every(c => c.ready);
        if (allReady) {
          healthStatus = 'healthy';
          message = 'Running and ready';
        } else {
          healthStatus = 'degraded';
          const readyCount = containerStatuses.filter(c => c.ready).length;
          message = `Running but only ${readyCount}/${containerStatuses.length} containers ready`;
        }
        break;
      case 'Succeeded':
        healthStatus = 'healthy';
        message = 'Completed successfully';
        break;
      case 'Pending':
        healthStatus = 'degraded';
        message = 'Pending';
        break;
      case 'Failed':
        healthStatus = 'unhealthy';
        message = 'Failed';
        break;
      default:
        healthStatus = 'unknown';
        message = `Unknown phase: ${phase}`;
    }

    return {
      kind: 'Pod',
      name,
      namespace,
      status: healthStatus,
      message,
    };
  }

  private async checkServiceHealth(name: string, namespace: string): Promise<K8sHealthCheckResult> {
    const service = await this.k8sApi.readNamespacedService(name, namespace);
    const spec = service.body.spec;
    const status = service.body.status;

    let healthStatus: 'healthy' | 'unhealthy' | 'degraded' | 'unknown' = 'healthy';
    let message = 'Service exists';

    // Check if service has endpoints
    try {
      const endpoints = await this.k8sApi.readNamespacedEndpoints(name, namespace);
      const subsets = endpoints.body.subsets || [];
      const totalAddresses = subsets.reduce((sum, subset) => sum + (subset.addresses?.length || 0), 0);

      if (totalAddresses === 0) {
        healthStatus = 'unhealthy';
        message = 'No endpoints available';
      } else {
        healthStatus = 'healthy';
        message = `${totalAddresses} endpoint(s) available`;
      }
    } catch (error: any) {
      // Endpoints might not exist for some service types (e.g., ExternalName)
      if (spec?.type === 'ExternalName') {
        healthStatus = 'healthy';
        message = 'ExternalName service';
      } else {
        healthStatus = 'degraded';
        message = 'Endpoints check failed';
      }
    }

    return {
      kind: 'Service',
      name,
      namespace,
      status: healthStatus,
      message,
    };
  }

  async rebootNode(nodeName: string): Promise<void> {
    try {
      logger.info(`Rebooting node ${nodeName} via SSH...`);
      
      // Get node IP
      const nodes = await this.getNodes();
      const node = nodes.find(n => n.name === nodeName);
      
      if (!node || !node.ip) {
        throw new Error(`Node ${nodeName} not found or has no IP address`);
      }

      if (!this.sshConfig) {
        throw new Error('SSH configuration not found in kubernetes config');
      }

      const sshPort = this.sshConfig.port || 22;
      const sshUser = this.sshConfig.username;
      
      let sshCommand = '';
      
      if (this.sshConfig.privateKey) {
        // Use key-based authentication
        sshCommand = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${sshPort} -i "${this.sshConfig.privateKey}" ${sshUser}@${node.ip} "sudo reboot"`;
      } else if (this.sshConfig.password) {
        // Use password-based authentication with sshpass
        sshCommand = `sshpass -p "${this.sshConfig.password}" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${sshPort} ${sshUser}@${node.ip} "sudo reboot"`;
      } else {
        throw new Error('No SSH authentication method configured (password or privateKey required)');
      }

      await execAsync(sshCommand);
      logger.info(`Successfully sent reboot command to node ${nodeName}`);
    } catch (error: any) {
      logger.error(`Failed to reboot node ${nodeName}:`, error.message);
      throw new Error(`Failed to reboot node: ${error.message}`);
    }
  }

  async shutdownNode(nodeName: string): Promise<void> {
    try {
      logger.info(`Shutting down node ${nodeName} via SSH...`);
      
      // Get node IP
      const nodes = await this.getNodes();
      const node = nodes.find(n => n.name === nodeName);
      
      if (!node || !node.ip) {
        throw new Error(`Node ${nodeName} not found or has no IP address`);
      }

      if (!this.sshConfig) {
        throw new Error('SSH configuration not found in kubernetes config');
      }

      const sshPort = this.sshConfig.port || 22;
      const sshUser = this.sshConfig.username;
      
      let sshCommand = '';
      
      if (this.sshConfig.privateKey) {
        // Use key-based authentication
        sshCommand = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${sshPort} -i "${this.sshConfig.privateKey}" ${sshUser}@${node.ip} "sudo shutdown -h now"`;
      } else if (this.sshConfig.password) {
        // Use password-based authentication with sshpass
        sshCommand = `sshpass -p "${this.sshConfig.password}" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${sshPort} ${sshUser}@${node.ip} "sudo shutdown -h now"`;
      } else {
        throw new Error('No SSH authentication method configured (password or privateKey required)');
      }

      await execAsync(sshCommand);
      logger.info(`Successfully sent shutdown command to node ${nodeName}`);
    } catch (error: any) {
      logger.error(`Failed to shutdown node ${nodeName}:`, error.message);
      throw new Error(`Failed to shutdown node: ${error.message}`);
    }
  }

  async runAptCommand(nodeName: string, command: string): Promise<string> {
    try {
      logger.info(`Running apt command "${command}" on node ${nodeName} via SSH...`);
      
      // Get node IP
      const nodes = await this.getNodes();
      const node = nodes.find(n => n.name === nodeName);
      
      if (!node || !node.ip) {
        throw new Error(`Node ${nodeName} not found or has no IP address`);
      }

      if (!this.sshConfig) {
        throw new Error('SSH configuration not found in kubernetes config');
      }

      const sshPort = this.sshConfig.port || 22;
      const sshUser = this.sshConfig.username;
      
      // Validate command is an apt command
      const validCommands = ['update', 'upgrade', 'dist-upgrade', 'autoremove', 'autoclean', 'clean'];
      if (!validCommands.includes(command)) {
        throw new Error(`Invalid apt command: ${command}. Must be one of: ${validCommands.join(', ')}`);
      }

      // Build the apt command with appropriate flags
      let aptCommand = '';
      if (command === 'update') {
        aptCommand = 'sudo apt-get update';
      } else if (command === 'upgrade') {
        aptCommand = 'sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y';
      } else if (command === 'dist-upgrade') {
        aptCommand = 'sudo DEBIAN_FRONTEND=noninteractive apt-get dist-upgrade -y';
      } else if (command === 'autoremove') {
        aptCommand = 'sudo DEBIAN_FRONTEND=noninteractive apt-get autoremove -y';
      } else if (command === 'autoclean') {
        aptCommand = 'sudo apt-get autoclean';
      } else if (command === 'clean') {
        aptCommand = 'sudo apt-get clean';
      }
      
      let sshCommand = '';
      
      if (this.sshConfig.privateKey) {
        // Use key-based authentication
        sshCommand = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${sshPort} -i "${this.sshConfig.privateKey}" ${sshUser}@${node.ip} "${aptCommand}"`;
      } else if (this.sshConfig.password) {
        // Use password-based authentication with sshpass
        sshCommand = `sshpass -p "${this.sshConfig.password}" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${sshPort} ${sshUser}@${node.ip} "${aptCommand}"`;
      } else {
        throw new Error('No SSH authentication method configured (password or privateKey required)');
      }

      const { stdout, stderr } = await execAsync(sshCommand);
      const output = stdout || stderr || 'Command completed successfully';
      logger.info(`Successfully executed apt ${command} on node ${nodeName}`);
      return output;
    } catch (error: any) {
      logger.error(`Failed to run apt ${command} on node ${nodeName}:`, error.message);
      throw new Error(`Failed to run apt command: ${error.message}`);
    }
  }

  async runSSHCommand(nodeName: string, command: string): Promise<string> {
    try {
      logger.info(`Running SSH command on node ${nodeName}: ${command}`);
      
      // Get node IP
      const nodes = await this.getNodes();
      const node = nodes.find(n => n.name === nodeName);
      
      if (!node || !node.ip) {
        throw new Error(`Node ${nodeName} not found or has no IP address`);
      }

      if (!this.sshConfig) {
        throw new Error('SSH configuration not found in kubernetes config');
      }

      const sshPort = this.sshConfig.port || 22;
      const sshUser = this.sshConfig.username;
      
      // Escape single quotes in the command for safety
      const escapedCommand = command.replace(/'/g, "'\\''");
      
      let sshCommand = '';
      
      if (this.sshConfig.privateKey) {
        // Use key-based authentication
        sshCommand = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${sshPort} -i "${this.sshConfig.privateKey}" ${sshUser}@${node.ip} '${escapedCommand}'`;
      } else if (this.sshConfig.password) {
        // Use password-based authentication with sshpass
        sshCommand = `sshpass -p "${this.sshConfig.password}" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${sshPort} ${sshUser}@${node.ip} '${escapedCommand}'`;
      } else {
        throw new Error('No SSH authentication method configured (password or privateKey required)');
      }

      const { stdout, stderr } = await execAsync(sshCommand, { maxBuffer: 1024 * 1024 }); // 1MB buffer for output
      const output = stdout || stderr || 'Command completed with no output';
      logger.info(`Successfully executed SSH command on node ${nodeName}`);
      return output;
    } catch (error: any) {
      logger.error(`Failed to run SSH command on node ${nodeName}:`, error.message);
      // Include stderr in error message if available
      const errorOutput = error.stderr || error.stdout || error.message;
      throw new Error(`Failed to run SSH command: ${errorOutput}`);
    }
  }

  async getAllDeployments(namespace?: string): Promise<K8sHealthCheckResult[]> {
    try {
      logger.info(`Fetching all deployments${namespace ? ` in namespace ${namespace}` : ' across all namespaces'}...`);
      
      const response = namespace 
        ? await this.appsApi.listNamespacedDeployment(namespace)
        : await this.appsApi.listDeploymentForAllNamespaces();
      
      const results = await Promise.all(
        response.body.items.map(async (deployment) => {
          const name = deployment.metadata?.name || 'unknown';
          const ns = deployment.metadata?.namespace || 'default';
          
          try {
            return await this.checkDeploymentHealth(name, ns);
          } catch (error: any) {
            return {
              kind: 'Deployment',
              name,
              namespace: ns,
              status: 'unknown' as const,
              message: error.message,
            };
          }
        })
      );
      
      logger.info(`Found ${results.length} deployments`);
      return results;
    } catch (error: any) {
      logger.error('Failed to get deployments:', error.message);
      throw new Error(`Failed to get deployments: ${error.message}`);
    }
  }

  async getAllStatefulSets(namespace?: string): Promise<K8sHealthCheckResult[]> {
    try {
      logger.info(`Fetching all statefulsets${namespace ? ` in namespace ${namespace}` : ' across all namespaces'}...`);
      
      const response = namespace
        ? await this.appsApi.listNamespacedStatefulSet(namespace)
        : await this.appsApi.listStatefulSetForAllNamespaces();
      
      const results = await Promise.all(
        response.body.items.map(async (statefulset) => {
          const name = statefulset.metadata?.name || 'unknown';
          const ns = statefulset.metadata?.namespace || 'default';
          
          try {
            return await this.checkStatefulSetHealth(name, ns);
          } catch (error: any) {
            return {
              kind: 'StatefulSet',
              name,
              namespace: ns,
              status: 'unknown' as const,
              message: error.message,
            };
          }
        })
      );
      
      logger.info(`Found ${results.length} statefulsets`);
      return results;
    } catch (error: any) {
      logger.error('Failed to get statefulsets:', error.message);
      throw new Error(`Failed to get statefulsets: ${error.message}`);
    }
  }

  async getAllDaemonSets(namespace?: string): Promise<K8sHealthCheckResult[]> {
    try {
      logger.info(`Fetching all daemonsets${namespace ? ` in namespace ${namespace}` : ' across all namespaces'}...`);
      
      const response = namespace
        ? await this.appsApi.listNamespacedDaemonSet(namespace)
        : await this.appsApi.listDaemonSetForAllNamespaces();
      
      const results = await Promise.all(
        response.body.items.map(async (daemonset) => {
          const name = daemonset.metadata?.name || 'unknown';
          const ns = daemonset.metadata?.namespace || 'default';
          
          try {
            return await this.checkDaemonSetHealth(name, ns);
          } catch (error: any) {
            return {
              kind: 'DaemonSet',
              name,
              namespace: ns,
              status: 'unknown' as const,
              message: error.message,
            };
          }
        })
      );
      
      logger.info(`Found ${results.length} daemonsets`);
      return results;
    } catch (error: any) {
      logger.error('Failed to get daemonsets:', error.message);
      throw new Error(`Failed to get daemonsets: ${error.message}`);
    }
  }

  async getAllK8sResources(namespace?: string): Promise<K8sHealthCheckResult[]> {
    try {
      logger.info('Fetching all K8s resources...');
      
      const [deployments, statefulsets, daemonsets] = await Promise.all([
        this.getAllDeployments(namespace).catch(() => []),
        this.getAllStatefulSets(namespace).catch(() => []),
        this.getAllDaemonSets(namespace).catch(() => []),
      ]);
      
      const allResources = [...deployments, ...statefulsets, ...daemonsets];
      logger.info(`Found ${allResources.length} total K8s resources`);
      
      return allResources;
    } catch (error: any) {
      logger.error('Failed to get all K8s resources:', error.message);
      throw new Error(`Failed to get all K8s resources: ${error.message}`);
    }
  }
}
