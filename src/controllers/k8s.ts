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
      
      const cluster: k8s.Cluster = {
        name: 'custom-cluster',
        server: config.cluster,
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
      
      logger.info(`Connected to K8s cluster: ${config.cluster}`);
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
}
