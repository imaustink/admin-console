// Type definitions for the Electron API exposed to the renderer process

export interface UnifiDevice {
  _id: string;
  name: string;
  mac: string;
  ip: string;
  model: string;
  type: string;
  version: string;
  state: number;
  uptime: number;
}

export interface InternetStats {
  uptime: number;
  uptimePercentage: number;
  downloadSpeed: number; // Mbps
  uploadSpeed: number; // Mbps
  downloadBitrate: number; // bps (current)
  uploadBitrate: number; // bps (current)
  latency: number; // ms
}

export interface K8sConfig {
  // If not provided, will use default kubeconfig
  cluster?: string | string[];     // Kubernetes API server URL(s) (e.g., https://192.168.1.100:6443) - supports multiple addresses for fallback
  token?: string;       // Service account token
  caData?: string;      // Base64-encoded CA certificate
  skipTLSVerify?: boolean; // Skip TLS verification (not recommended for production)
  ssh?: {
    username: string;   // SSH username for node access
    password?: string;  // SSH password (if using password auth)
    privateKey?: string; // Path to SSH private key (if using key auth)
    port?: number;      // SSH port (default: 22)
  };
}

export interface HealthCheckConfig {
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'HEAD';
  expectedStatus: number;
  timeout: number;
  interval: number;
  hidden?: boolean;
}

export interface HealthCheckResult {
  name: string;
  url: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  statusCode?: number;
  responseTime?: number;
  error?: string;
  timestamp: number;
  hidden?: boolean;
}

export interface K8sHealthCheckConfig {
  name: string;
  namespace: string;
  kind: 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Service' | 'Pod';
  interval: number;
  hidden?: boolean;
}

export interface K8sHealthCheckResult {
  name: string;
  namespace: string;
  kind: string;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  message?: string;
  responseTime?: number;
  replicas?: {
    desired: number;
    ready: number;
    available: number;
  };
  conditions?: Array<{
    type: string;
    status: string;
    message?: string;
  }>;
  error?: string;
  timestamp?: number;
  hidden?: boolean;
}

export interface K8sNode {
  name: string;
  status: string;
  ip?: string;
  mac?: string;
  os?: string;
  kernel?: string;
  containerRuntime?: string;
  kubeletVersion?: string;
  schedulable: boolean;
}

export interface PortMapping {
  nodeName: string;
  nodeIp: string;
  nodeMac?: string;
  switchMac?: string;
  switchName?: string;
  portIdx?: number;
  poeAvailable: boolean;
}

export interface NodePortMapping {
  nodeName: string;
  switchName: string;
  switchMac?: string;
  portIdx: number;
  poeAvailable: boolean;
}

export interface SystemStatus {
  unifi: {
    connected: boolean;
    deviceCount: number;
    internet?: InternetStats;
  };
  k8s: {
    connected: boolean;
    nodeCount: number;
    readyNodes: number;
    resourceHealth?: K8sHealthCheckResult[];
  };
  healthChecks: HealthCheckResult[];
  timestamp: number;
}

export interface ElectronAPI {
  unifi: {
    getDevices: () => Promise<UnifiDevice[]>;
    getInternetStats: () => Promise<InternetStats>;
    updateFirmware: (deviceId: string) => Promise<any>;
    powerCycle: (deviceId: string) => Promise<any>;
  };
  k8s: {
    getNodes: () => Promise<K8sNode[]>;
    checkResourceHealth: (config: K8sHealthCheckConfig) => Promise<K8sHealthCheckResult>;
    drainNode: (nodeName: string) => Promise<any>;
    uncordonNode: (nodeName: string) => Promise<any>;
    cordonNode: (nodeName: string) => Promise<any>;
    getNodePortMappings: () => Promise<NodePortMapping[]>;
    powerCycleNodePort: (nodeName: string) => Promise<any>;
    rebootNode: (nodeName: string) => Promise<any>;
    shutdownNode: (nodeName: string) => Promise<any>;
  };
  status: {
    getSystemStatus: () => Promise<SystemStatus>;
    checkHealth: (url: string) => Promise<HealthCheckResult>;
  };
  app: {
    exit: () => Promise<void>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
