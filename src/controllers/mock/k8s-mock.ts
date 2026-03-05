import { K8sNode, K8sHealthCheckResult } from '../../types';
import logger from '../../utils/logger';

export class K8sControllerMock {
  constructor() {
    logger.info('[MOCK] K8sController initialized');
  }

  async getNodes(): Promise<K8sNode[]> {
    logger.info('[MOCK] Fetching Kubernetes nodes...');
    await new Promise(resolve => setTimeout(resolve, 200));

    return [
      {
        name: 'k8s-master-01',
        ip: '192.168.1.101',
        mac: 'aa:bb:cc:dd:ee:01',
        status: 'Ready',
        os: 'Ubuntu 22.04.3 LTS',
        kernel: '5.15.0-91-generic',
        containerRuntime: 'containerd://1.7.11',
        kubeletVersion: 'v1.28.5',
        schedulable: false,
      },
      {
        name: 'k8s-worker-01',
        ip: '192.168.1.111',
        mac: 'aa:bb:cc:dd:ee:02',
        status: 'Ready',
        os: 'Ubuntu 22.04.3 LTS',
        kernel: '5.15.0-91-generic',
        containerRuntime: 'containerd://1.7.11',
        kubeletVersion: 'v1.28.5',
        schedulable: true,
      },
      {
        name: 'k8s-worker-02',
        ip: '192.168.1.112',
        mac: 'aa:bb:cc:dd:ee:03',
        status: 'Ready',
        os: 'Ubuntu 22.04.3 LTS',
        kernel: '5.15.0-91-generic',
        containerRuntime: 'containerd://1.7.11',
        kubeletVersion: 'v1.28.5',
        schedulable: true,
      },
      {
        name: 'k8s-worker-03',
        ip: '192.168.1.113',
        mac: 'aa:bb:cc:dd:ee:04',
        status: 'Ready',
        os: 'Ubuntu 22.04.3 LTS',
        kernel: '5.15.0-91-generic',
        containerRuntime: 'containerd://1.7.11',
        kubeletVersion: 'v1.28.5',
        schedulable: true,
      },
      {
        name: 'k8s-worker-04',
        ip: '192.168.1.114',
        mac: 'aa:bb:cc:dd:ee:05',
        status: 'Ready',
        os: 'Ubuntu 22.04.3 LTS',
        kernel: '5.15.0-91-generic',
        containerRuntime: 'containerd://1.7.11',
        kubeletVersion: 'v1.28.5',
        schedulable: true,
      },
    ];
  }

  async drainNode(nodeName: string): Promise<void> {
    logger.info(`[MOCK] Draining node ${nodeName}...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  async cordonNode(nodeName: string): Promise<void> {
    logger.info(`[MOCK] Cordoning node ${nodeName}...`);
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  async uncordonNode(nodeName: string): Promise<void> {
    logger.info(`[MOCK] Uncordoning node ${nodeName}...`);
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  async checkResourceHealth(
    kind: 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Pod' | 'Service',
    name: string,
    namespace: string = 'default'
  ): Promise<K8sHealthCheckResult> {
    logger.info(`[MOCK] Checking health for ${kind}/${namespace}/${name}...`);
    await new Promise(resolve => setTimeout(resolve, 100));

    // Return mock health based on resource type
    const mockResults: { [key: string]: K8sHealthCheckResult } = {
      'Deployment/default/nginx': {
        kind: 'Deployment',
        name: 'nginx',
        namespace: 'default',
        status: 'healthy',
        message: '3/3 replicas ready',
        replicas: { desired: 3, ready: 3, available: 3 },
        responseTime: 45,
      },
      'StatefulSet/default/postgres': {
        kind: 'StatefulSet',
        name: 'postgres',
        namespace: 'default',
        status: 'healthy',
        message: '1/1 replicas ready',
        replicas: { desired: 1, ready: 1, available: 1 },
        responseTime: 52,
      },
      'DaemonSet/kube-system/kube-proxy': {
        kind: 'DaemonSet',
        name: 'kube-proxy',
        namespace: 'kube-system',
        status: 'healthy',
        message: '5/5 pods ready',
        replicas: { desired: 5, ready: 5, available: 5 },
        responseTime: 38,
      },
      'Service/default/api': {
        kind: 'Service',
        name: 'api',
        namespace: 'default',
        status: 'healthy',
        message: '3 endpoint(s) available',
        responseTime: 28,
      },
      'Pod/default/standalone-pod': {
        kind: 'Pod',
        name: 'standalone-pod',
        namespace: 'default',
        status: 'healthy',
        message: 'Running and ready',
        responseTime: 33,
      },
    };

    const key = `${kind}/${namespace}/${name}`;
    const result = mockResults[key];

    if (result) {
      return result;
    }

    // Default mock response
    return {
      kind,
      name,
      namespace,
      status: 'healthy',
      message: 'Mock resource healthy',
      responseTime: 50,
    };
  }

  async rebootNode(nodeName: string): Promise<void> {
    logger.info(`[MOCK] Rebooting node ${nodeName} via SSH...`);
    await new Promise(resolve => setTimeout(resolve, 500));
    logger.info(`[MOCK] Successfully sent reboot command to node ${nodeName}`);
  }

  async shutdownNode(nodeName: string): Promise<void> {
    logger.info(`[MOCK] Shutting down node ${nodeName} via SSH...`);
    await new Promise(resolve => setTimeout(resolve, 500));
    logger.info(`[MOCK] Successfully sent shutdown command to node ${nodeName}`);
  }

  async runSSHCommand(nodeName: string, command: string): Promise<string> {
    logger.info(`[MOCK] Running SSH command on node ${nodeName}: ${command}`);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Return mock output based on command content
    const output = `[MOCK OUTPUT for ${nodeName}]
Command: ${command}
Result: Command executed successfully
Sample output line 1
Sample output line 2
Sample output line 3`;
    
    logger.info(`[MOCK] Successfully executed SSH command on node ${nodeName}`);
    return output;
  }

  async getAllDeployments(namespace?: string): Promise<K8sHealthCheckResult[]> {
    logger.info(`[MOCK] Fetching all deployments${namespace ? ` in namespace ${namespace}` : ' across all namespaces'}...`);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const deployments: K8sHealthCheckResult[] = [
      {
        kind: 'Deployment',
        name: 'nginx-deployment',
        namespace: 'default',
        status: 'healthy',
        message: '3/3 replicas ready',
        replicas: { desired: 3, ready: 3, available: 3 },
        responseTime: 45,
      },
      {
        kind: 'Deployment',
        name: 'api-server',
        namespace: 'default',
        status: 'healthy',
        message: '2/2 replicas ready',
        replicas: { desired: 2, ready: 2, available: 2 },
        responseTime: 52,
      },
      {
        kind: 'Deployment',
        name: 'frontend',
        namespace: 'production',
        status: 'degraded',
        message: '2/3 replicas ready',
        replicas: { desired: 3, ready: 2, available: 2 },
        responseTime: 58,
      },
    ];
    
    if (namespace) {
      return deployments.filter(d => d.namespace === namespace);
    }
    
    return deployments;
  }

  async getAllStatefulSets(namespace?: string): Promise<K8sHealthCheckResult[]> {
    logger.info(`[MOCK] Fetching all statefulsets${namespace ? ` in namespace ${namespace}` : ' across all namespaces'}...`);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const statefulsets: K8sHealthCheckResult[] = [
      {
        kind: 'StatefulSet',
        name: 'redis-statefulset',
        namespace: 'default',
        status: 'healthy',
        message: '1/1 replicas ready',
        replicas: { desired: 1, ready: 1, available: 1 },
        responseTime: 48,
      },
      {
        kind: 'StatefulSet',
        name: 'postgres',
        namespace: 'database',
        status: 'healthy',
        message: '3/3 replicas ready',
        replicas: { desired: 3, ready: 3, available: 3 },
        responseTime: 62,
      },
    ];
    
    if (namespace) {
      return statefulsets.filter(s => s.namespace === namespace);
    }
    
    return statefulsets;
  }

  async getAllDaemonSets(namespace?: string): Promise<K8sHealthCheckResult[]> {
    logger.info(`[MOCK] Fetching all daemonsets${namespace ? ` in namespace ${namespace}` : ' across all namespaces'}...`);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const daemonsets: K8sHealthCheckResult[] = [
      {
        kind: 'DaemonSet',
        name: 'kube-proxy',
        namespace: 'kube-system',
        status: 'healthy',
        message: '5/5 pods ready',
        replicas: { desired: 5, ready: 5, available: 5 },
        responseTime: 38,
      },
      {
        kind: 'DaemonSet',
        name: 'node-exporter',
        namespace: 'monitoring',
        status: 'healthy',
        message: '5/5 pods ready',
        replicas: { desired: 5, ready: 5, available: 5 },
        responseTime: 42,
      },
    ];
    
    if (namespace) {
      return daemonsets.filter(d => d.namespace === namespace);
    }
    
    return daemonsets;
  }

  async getAllK8sResources(namespace?: string): Promise<K8sHealthCheckResult[]> {
    logger.info('[MOCK] Fetching all K8s resources...');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const [deployments, statefulsets, daemonsets] = await Promise.all([
      this.getAllDeployments(namespace),
      this.getAllStatefulSets(namespace),
      this.getAllDaemonSets(namespace),
    ]);
    
    const allResources = [...deployments, ...statefulsets, ...daemonsets];
    logger.info(`[MOCK] Found ${allResources.length} total K8s resources`);
    
    return allResources;
  }
}
