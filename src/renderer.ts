// Global error handlers for renderer process
window.addEventListener('error', (event) => {
  console.error('[Renderer Error]', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason);
});

document.addEventListener('DOMContentLoaded', () => {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    const handleTabSwitch = () => {
      const tabName = button.getAttribute('data-tab');
      
      // Remove active class from all tabs
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Add active class to clicked tab
      button.classList.add('active');
      if (tabName) {
        document.getElementById(tabName)?.classList.add('active');
      }
    };
    
    button.addEventListener('click', handleTabSwitch);
    button.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handleTabSwitch();
    });
  });

  // Initialize tabs
  loadUnifiDevices();
  loadK8sNodes();
  loadSystemStatus();

  // Refresh buttons with touch support
  const refreshUnifi = document.getElementById('refresh-unifi');
  refreshUnifi?.addEventListener('click', loadUnifiDevices);
  refreshUnifi?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    loadUnifiDevices();
  });
  
  const refreshK8s = document.getElementById('refresh-k8s');
  refreshK8s?.addEventListener('click', loadK8sNodes);
  refreshK8s?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    loadK8sNodes();
  });
  
  const refreshStatus = document.getElementById('refresh-status');
  refreshStatus?.addEventListener('click', loadSystemStatus);
  refreshStatus?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    loadSystemStatus();
  });
  
  // Exit button with touch support
  const exitBtn = document.getElementById('exit-btn');
  const handleExit = async () => {
    if (confirm('Are you sure you want to exit?')) {
      await window.electronAPI.app.exit();
    }
  };
  exitBtn?.addEventListener('click', handleExit);
  exitBtn?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleExit();
  });
});

// Unifi Functions
async function loadUnifiDevices() {
  const container = document.getElementById('unifi-devices');
  if (!container) return;

  container.innerHTML = '<div class="loading">Loading devices...</div>';

  try {
    const devices = await window.electronAPI.unifi.getDevices();
    
    if (devices.length === 0) {
      container.innerHTML = '<div class="empty">No devices found</div>';
      return;
    }

    container.innerHTML = devices.map(device => `
      <div class="device-card">
        <div class="device-header">
          <h3>${device.name || 'Unknown Device'}</h3>
          <span class="status-badge ${device.state === 1 ? 'online' : 'offline'}">
            ${device.state === 1 ? 'Online' : 'Offline'}
          </span>
        </div>
        <div class="device-info">
          <div class="info-row">
            <span class="label">IP:</span>
            <span class="value">${device.ip || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">MAC:</span>
            <span class="value">${device.mac || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">Model:</span>
            <span class="value">${device.model || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">Version:</span>
            <span class="value">${device.version || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">Uptime:</span>
            <span class="value">${formatUptime(device.uptime)}</span>
          </div>
        </div>
        <div class="device-actions">
          <button class="btn btn-warning" onclick="powerCycleDevice('${device._id}', '${device.name}')">
            Power Cycle
          </button>
          <button class="btn btn-info" onclick="updateFirmware('${device._id}', '${device.name}')">
            Update Firmware
          </button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading Unifi devices:', error);
    container.innerHTML = `<div class="error">Error: ${(error as Error).message}</div>`;
  }
}

async function powerCycleDevice(deviceId: string, deviceName: string) {
  if (!confirm(`Are you sure you want to power cycle ${deviceName}?`)) return;

  try {
    await window.electronAPI.unifi.powerCycle(deviceId);
    alert(`Power cycle initiated for ${deviceName}`);
    loadUnifiDevices();
  } catch (error) {
    alert(`Error: ${(error as Error).message}`);
  }
}

async function updateFirmware(deviceId: string, deviceName: string) {
  if (!confirm(`Are you sure you want to update firmware for ${deviceName}?`)) return;

  try {
    await window.electronAPI.unifi.updateFirmware(deviceId);
    alert(`Firmware update initiated for ${deviceName}`);
    loadUnifiDevices();
  } catch (error) {
    alert(`Error: ${(error as Error).message}`);
  }
}

// Kubernetes Functions
async function loadK8sNodes() {
  const container = document.getElementById('k8s-nodes');
  if (!container) return;

  container.innerHTML = '<div class="loading">Loading nodes...</div>';

  try {
    const [nodes, portMappings] = await Promise.all([
      window.electronAPI.k8s.getNodes(),
      window.electronAPI.k8s.getNodePortMappings()
    ]);
    
    if (nodes.length === 0) {
      container.innerHTML = '<div class="empty">No nodes found</div>';
      return;
    }

    container.innerHTML = nodes.map(node => {
      const mapping = portMappings.find(m => m.nodeName === node.name);
      const hasPoePort = mapping?.poeAvailable || false;
      return `
      <div class="node-card">
        <div class="node-header">
          <h3>${node.name}</h3>
          <span class="status-badge ${node.status.toLowerCase()}">
            ${node.status}
          </span>
        </div>
        <div class="node-info">
          <div class="info-row">
            <span class="label">IP:</span>
            <span class="value">${node.ip || 'N/A'}</span>
          </div>
          ${node.mac ? `
          <div class="info-row">
            <span class="label">MAC:</span>
            <span class="value">${node.mac}</span>
          </div>` : ''}
          ${hasPoePort && mapping ? `
          <div class="info-row">
            <span class="label">PoE Switch:</span>
            <span class="value">${mapping.switchName} Port ${mapping.portIdx}</span>
          </div>` : ''}
          ${!hasPoePort ? `
          <div class="info-row">
            <span class="label">PoE Status:</span>
            <span class="value" style="color: #f59e0b;">Not on PoE switch</span>
          </div>` : ''}
          <div class="info-row">
            <span class="label">OS:</span>
            <span class="value">${node.os || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">Kernel:</span>
            <span class="value">${node.kernel || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">Container Runtime:</span>
            <span class="value">${node.containerRuntime || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">Kubelet:</span>
            <span class="value">${node.kubeletVersion || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">Schedulable:</span>
            <span class="value">${node.schedulable ? 'Yes' : 'No'}</span>
          </div>
        </div>
        <div class="node-actions">
          ${node.schedulable ? 
            `<button class="btn btn-warning" onclick="drainNode('${node.name}')">Drain</button>
             <button class="btn btn-secondary" onclick="cordonNode('${node.name}')">Cordon</button>` :
            `<button class="btn btn-success" onclick="uncordonNode('${node.name}')">Uncordon</button>`
          }
          <button class="btn btn-danger" 
                  onclick="powerCycleNodePort('${node.name}')"
                  ${!hasPoePort ? 'disabled title=\"Not on PoE switch - may use PoE injector\"' : ''}>
            <span class="icon-bolt"></span> Cycle Port
          </button>
          <button class="btn btn-warning" onclick="rebootNode('${node.name}', ${node.schedulable})">
            <span class="icon-refresh"></span> Reboot
          </button>
          <button class="btn btn-danger" onclick="shutdownNode('${node.name}', ${node.schedulable})">
            <span class="icon-power"></span> Shutdown
          </button>
        </div>
      </div>
    `;
    }).join('');
  } catch (error) {
    console.error('Error loading K8s nodes:', error);
    container.innerHTML = `<div class="error">Error: ${(error as Error).message}</div>`;
  }
}

async function drainNode(nodeName: string) {
  if (!confirm(`Are you sure you want to drain node ${nodeName}?`)) return;

  try {
    await window.electronAPI.k8s.drainNode(nodeName);
    alert(`Drain initiated for ${nodeName}`);
    loadK8sNodes();
  } catch (error) {
    alert(`Error: ${(error as Error).message}`);
  }
}

async function uncordonNode(nodeName: string) {
  if (!confirm(`Are you sure you want to uncordon node ${nodeName}?`)) return;

  try {
    await window.electronAPI.k8s.uncordonNode(nodeName);
    alert(`Uncordon successful for ${nodeName}`);
    loadK8sNodes();
  } catch (error) {
    alert(`Error: ${(error as Error).message}`);
  }
}

async function cordonNode(nodeName: string) {
  if (!confirm(`Are you sure you want to cordon node ${nodeName}?`)) return;

  try {
    await window.electronAPI.k8s.cordonNode(nodeName);
    alert(`Cordon successful for ${nodeName}`);
    loadK8sNodes();
  } catch (error) {
    alert(`Error: ${(error as Error).message}`);
  }
}

async function powerCycleNodePort(nodeName: string) {
  if (!confirm(`Are you sure you want to power cycle the PoE port for node ${nodeName}?\n\nThis will cause a hard reboot of the node.`)) return;

  try {
    await window.electronAPI.k8s.powerCycleNodePort(nodeName);
    alert(`Power cycle initiated for ${nodeName}'s PoE port`);
    loadK8sNodes();
  } catch (error) {
    alert(`Error: ${(error as Error).message}`);
  }
}

async function rebootNode(nodeName: string, schedulable: boolean) {
  // Only show confirmation if node is schedulable (not cordoned)
  if (schedulable && !confirm(`Are you sure you want to reboot node ${nodeName} via SSH?\n\nThe node is still schedulable. Consider draining and cordoning it first.`)) return;

  try {
    await window.electronAPI.k8s.rebootNode(nodeName);
    alert(`Reboot command sent to ${nodeName}`);
    loadK8sNodes();
  } catch (error) {
    alert(`Error: ${(error as Error).message}`);
  }
}

async function shutdownNode(nodeName: string, schedulable: boolean) {
  // Only show confirmation if node is schedulable (not cordoned)
  if (schedulable && !confirm(`Are you sure you want to shutdown node ${nodeName} via SSH?\n\nThe node is still schedulable. Consider draining and cordoning it first.\n\nThis will power off the node completely.`)) return;

  try {
    await window.electronAPI.k8s.shutdownNode(nodeName);
    alert(`Shutdown command sent to ${nodeName}`);
    loadK8sNodes();
  } catch (error) {
    alert(`Error: ${(error as Error).message}`);
  }
}

// Status Functions
async function loadSystemStatus() {
  const container = document.getElementById('status-info');
  if (!container) return;

  container.innerHTML = '<div class="loading">Loading status...</div>';

  try {
    const status = await window.electronAPI.status.getSystemStatus();
    
    let html = `
      <div class="status-card">
        <h3>Unifi Controller</h3>
        <div class="status-indicator ${status.unifi.connected ? 'online' : 'offline'}">
          ${status.unifi.connected ? '● Connected' : '● Disconnected'}
        </div>
        <div class="info-row">
          <span class="label">Devices:</span>
          <span class="value">${status.unifi.deviceCount || 0}</span>
        </div>
        ${status.unifi.internet && status.unifi.internet.uptime !== undefined ? `
        <h4 style="margin-top: 1rem; margin-bottom: 0.5rem;">Internet Statistics</h4>
        <div class="info-row">
          <span class="label">Uptime:</span>
          <span class="value">${formatUptime(status.unifi.internet.uptime)} (${(status.unifi.internet.uptimePercentage || 0).toFixed(2)}%)</span>
        </div>
        <div class="info-row">
          <span class="label">Download Speed:</span>
          <span class="value">${(status.unifi.internet.downloadSpeed || 0).toFixed(1)} Mbps</span>
        </div>
        <div class="info-row">
          <span class="label">Upload Speed:</span>
          <span class="value">${(status.unifi.internet.uploadSpeed || 0).toFixed(1)} Mbps</span>
        </div>
        <div class="info-row">
          <span class="label">Current Download:</span>
          <span class="value">${((status.unifi.internet.downloadBitrate || 0) / 1000000).toFixed(1)} Mbps</span>
        </div>
        <div class="info-row">
          <span class="label">Current Upload:</span>
          <span class="value">${((status.unifi.internet.uploadBitrate || 0) / 1000000).toFixed(1)} Mbps</span>
        </div>
        <div class="info-row">
          <span class="label">Latency:</span>
          <span class="value">${status.unifi.internet.latency || 0} ms</span>
        </div>
        ` : ''}
      </div>

      <div class="status-card">
        <h3>Kubernetes Cluster</h3>
        <div class="status-indicator ${status.k8s.connected ? 'online' : 'offline'}">
          ${status.k8s.connected ? '● Connected' : '● Disconnected'}
        </div>
        <div class="info-row">
          <span class="label">Nodes:</span>
          <span class="value">${status.k8s.nodeCount || 0}</span>
        </div>
        <div class="info-row">
          <span class="label">Ready Nodes:</span>
          <span class="value">${status.k8s.readyNodes || 0}</span>
        </div>
        ${status.k8s.resourceHealth && status.k8s.resourceHealth.length > 0 ? `
        <h4 style="margin-top: 1rem; margin-bottom: 0.5rem;">Resource Health</h4>
        ${status.k8s.resourceHealth.map(resource => `
          <div class="info-row">
            <span class="label">${resource.kind}/${resource.name}:</span>
            <span class="value">
              <span class="status-badge ${resource.status}">${resource.status}</span>
              ${resource.replicas ? `${resource.replicas.ready}/${resource.replicas.desired}` : ''}
            </span>
          </div>
        `).join('')}
        ` : ''}
      </div>

      ${status.healthChecks && status.healthChecks.length > 0 ? `
      <div class="status-card">
        <h3>Service Health Checks</h3>
        ${status.healthChecks.map(check => `
          <div class="info-row">
            <span class="label">${check.name}:</span>
            <span class="value">
              <span class="status-badge ${check.status}">${check.status}</span>
              ${check.responseTime ? `${check.responseTime}ms` : ''}
            </span>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <div class="status-card">
        <h3>Dashboard</h3>
        <div class="info-row">
          <span class="label">Last Updated:</span>
          <span class="value">${new Date().toLocaleString()}</span>
        </div>
      </div>
    `;
    
    container.innerHTML = html;
  } catch (error) {
    console.error('Error loading system status:', error);
    container.innerHTML = `<div class="error">Error: ${(error as Error).message}</div>`;
  }
}

// Helper Functions
function formatUptime(seconds: number): string {
  if (!seconds) return 'N/A';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Expose functions to global scope for onclick handlers
(window as any).powerCycleDevice = powerCycleDevice;
(window as any).updateFirmware = updateFirmware;
(window as any).drainNode = drainNode;
(window as any).uncordonNode = uncordonNode;
(window as any).cordonNode = cordonNode;
(window as any).powerCycleNodePort = powerCycleNodePort;
