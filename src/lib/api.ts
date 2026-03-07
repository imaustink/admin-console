/**
 * Typed wrappers around Tauri `invoke()` calls.
 * Command names mirror the Rust `#[tauri::command]` function names (snake_case).
 */
import { invoke } from '@tauri-apps/api/core';
import type {
  UnifiDevice,
  InternetStats,
  K8sNode,
  K8sHealthCheckConfig,
  K8sHealthCheckResult,
  NodePortMapping,
  SystemStatus,
} from './types';

// ─── UniFi ────────────────────────────────────────────────────────────────────

export const api = {
  unifi: {
    getDevices: () => invoke<UnifiDevice[]>('unifi_get_devices'),
    getInternetStats: () => invoke<InternetStats>('unifi_get_internet_stats'),
    powerCycle: (deviceId: string) => invoke<void>('unifi_power_cycle', { deviceId }),
    updateFirmware: (deviceId: string) => invoke<void>('unifi_update_firmware', { deviceId }),
  },

  // ─── Kubernetes ──────────────────────────────────────────────────────────────

  k8s: {
    getNodes: () => invoke<K8sNode[]>('k8s_get_nodes'),
    checkResourceHealth: (config: K8sHealthCheckConfig) =>
      invoke<K8sHealthCheckResult>('k8s_check_resource_health', { config }),
    drainNode: (nodeName: string) => invoke<void>('k8s_drain_node', { nodeName }),
    uncordonNode: (nodeName: string) => invoke<void>('k8s_uncordon_node', { nodeName }),
    cordonNode: (nodeName: string) => invoke<void>('k8s_cordon_node', { nodeName }),
    getNodePortMappings: () => invoke<NodePortMapping[]>('k8s_get_node_port_mappings'),
    powerCycleNodePort: (nodeName: string) =>
      invoke<void>('k8s_power_cycle_node_port', { nodeName }),
    rebootNode: (nodeName: string) => invoke<void>('k8s_reboot_node', { nodeName }),
    shutdownNode: (nodeName: string) => invoke<void>('k8s_shutdown_node', { nodeName }),
    runAptCommand: (nodeName: string, command: string) =>
      invoke<string>('k8s_run_apt_command', { nodeName, command }),
    runSSHCommand: (nodeName: string, command: string) =>
      invoke<string>('k8s_run_ssh_command', { nodeName, command }),
  },

  // ─── Status ───────────────────────────────────────────────────────────────────

  status: {
    getSystemStatus: () => invoke<SystemStatus>('status_get_system_status'),
  },

  // ─── App ─────────────────────────────────────────────────────────────────────

  app: {
    exit: () => invoke<void>('app_exit'),
    getVersion: () => invoke<string>('app_get_version'),
  },
};
