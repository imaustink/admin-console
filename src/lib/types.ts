// TypeScript types matching the Rust backend types (camelCase serialisation)

export interface UnifiDevice {
  _id: string;
  name: string;
  mac: string;
  ip?: string;
  model?: string;
  type?: string;
  version?: string;
  state: number;
  uptime: number;
  upgradable: boolean;
  upgradeToFirmware?: string;
}

export interface InternetStats {
  uptime: number;
  uptimePercentage: number;
  downloadSpeed: number;
  uploadSpeed: number;
  downloadBitrate: number;
  uploadBitrate: number;
  latency: number;
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

export interface K8sHealthCheckConfig {
  name: string;
  namespace: string;
  kind: 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Service' | 'Pod';
  interval?: number;
  hidden?: boolean;
}

export interface ReplicaStatus {
  desired: number;
  ready: number;
  available: number;
}

export interface K8sHealthCheckResult {
  kind: string;
  name: string;
  namespace: string;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  message?: string;
  replicas?: ReplicaStatus;
  responseTime?: number;
  timestamp?: number;
  hidden?: boolean;
}

export interface NodePortMapping {
  nodeName: string;
  switchName: string;
  switchMac?: string;
  portIdx: number;
  poeAvailable: boolean;
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

export interface UnifiStatus {
  connected: boolean;
  deviceCount: number;
  internet?: InternetStats;
}

export interface K8sStatus {
  connected: boolean;
  nodeCount: number;
  readyNodes: number;
  resourceHealth?: K8sHealthCheckResult[];
}

export interface SystemStatus {
  unifi: UnifiStatus;
  k8s: K8sStatus;
  healthChecks: HealthCheckResult[];
  timestamp: number;
}
