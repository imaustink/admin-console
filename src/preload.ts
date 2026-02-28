import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Unifi API
  unifi: {
    getDevices: () => ipcRenderer.invoke('unifi:getDevices'),
    getInternetStats: () => ipcRenderer.invoke('unifi:getInternetStats'),
    updateFirmware: (deviceId: string) => ipcRenderer.invoke('unifi:updateFirmware', deviceId),
    powerCycle: (deviceId: string) => ipcRenderer.invoke('unifi:powerCycle', deviceId),
  },
  // K8s API
  k8s: {
    getNodes: () => ipcRenderer.invoke('k8s:getNodes'),
    checkResourceHealth: (config: any) => ipcRenderer.invoke('k8s:checkResourceHealth', config),
    drainNode: (nodeName: string) => ipcRenderer.invoke('k8s:drainNode', nodeName),
    uncordonNode: (nodeName: string) => ipcRenderer.invoke('k8s:uncordonNode', nodeName),
    cordonNode: (nodeName: string) => ipcRenderer.invoke('k8s:cordonNode', nodeName),
    getNodePortMappings: () => ipcRenderer.invoke('k8s:getNodePortMappings'),
    powerCycleNodePort: (nodeName: string) => ipcRenderer.invoke('k8s:powerCycleNodePort', nodeName),
    rebootNode: (nodeName: string) => ipcRenderer.invoke('k8s:rebootNode', nodeName),
    shutdownNode: (nodeName: string) => ipcRenderer.invoke('k8s:shutdownNode', nodeName),
    runAptCommand: (nodeName: string, command: string) => ipcRenderer.invoke('k8s:runAptCommand', nodeName, command),
    runSSHCommand: (nodeName: string, command: string) => ipcRenderer.invoke('k8s:runSSHCommand', nodeName, command),
  },
  // Status API
  status: {
    getSystemStatus: () => ipcRenderer.invoke('status:getSystemStatus'),
    checkHealth: (url: string) => ipcRenderer.invoke('status:checkHealth', url),
  },
  // App API
  app: {
    exit: () => ipcRenderer.invoke('app:exit'),
  },
});
