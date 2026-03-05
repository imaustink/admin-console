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
            <span class="value">${device.version || 'N/A'}${device.upgradable && device.upgradeToFirmware ? ` <span style="color: #f59e0b;">(Update available: ${device.upgradeToFirmware})</span>` : ''}</span>
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
          <button class="btn ${device.upgradable ? 'btn-info' : 'btn-secondary'}" 
                  onclick="updateFirmware('${device._id}', '${device.name}')"
                  ${!device.upgradable ? 'disabled title="No firmware update available"' : ''}>
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
          ${mapping ? `
          <div class="info-row">
            <span class="label">Switch Port:</span>
            <span class="value">${mapping.switchName} Port ${mapping.portIdx}${hasPoePort ? ' <span style="color: #10b981;">(PoE)</span>' : ' <span style="color: #6b7280;">(Non-PoE)</span>'}</span>
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
          <div class="dropdown" data-node="${node.name}">
            <button class="dropdown-toggle" onclick="toggleDropdown('${node.name}')">
              Actions
            </button>
            <div class="dropdown-menu" id="dropdown-${node.name}">
              ${node.schedulable ? 
                `<button class="dropdown-item warning" onclick="drainNode('${node.name}')">
                  Drain Node
                </button>
                <button class="dropdown-item" onclick="cordonNode('${node.name}')">
                  Cordon Node
                </button>` :
                `<button class="dropdown-item success" onclick="uncordonNode('${node.name}')">
                  Uncordon Node
                </button>`
              }
              <button class="dropdown-item info" onclick="openCommandModal('${node.name}')">
                Run SSH Command
              </button>
              <button class="dropdown-item info" onclick="runAptCommand('${node.name}')">
                APT Commands
              </button>
              <button class="dropdown-item danger" 
                      onclick="powerCycleNodePort('${node.name}')"
                      ${!hasPoePort ? 'disabled title="Not on PoE switch"' : ''}>
                Cycle PoE Port
              </button>
              <button class="dropdown-item warning" onclick="rebootNode('${node.name}', ${node.schedulable})">
                Reboot Node
              </button>
              <button class="dropdown-item danger" onclick="shutdownNode('${node.name}', ${node.schedulable})">
                Shutdown Node
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    }).join('');

    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
          menu.classList.remove('show');
          // Remove elevated state from parent card
          const parentCard = menu.closest('.node-card, .device-card');
          if (parentCard) {
            parentCard.classList.remove('dropdown-open');
          }
        });
      }
    });
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

async function runAptCommand(nodeName: string) {
  openAptModal(nodeName);
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
          <span class="value">${(status.unifi.internet.downloadSpeed || 0).toFixed(2)} Mbps</span>
        </div>
        <div class="info-row">
          <span class="label">Upload Speed:</span>
          <span class="value">${(status.unifi.internet.uploadSpeed || 0).toFixed(2)} Mbps</span>
        </div>
        <div class="info-row">
          <span class="label">Current Download:</span>
          <span class="value">${((status.unifi.internet.downloadBitrate || 0) / 1000000).toFixed(2)} Mbps</span>
        </div>
        <div class="info-row">
          <span class="label">Current Upload:</span>
          <span class="value">${((status.unifi.internet.uploadBitrate || 0) / 1000000).toFixed(2)} Mbps</span>
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

      ${status.healthChecks && status.healthChecks.length > 0 ? (() => {
        const unhealthyChecks = status.healthChecks.filter(c => c.status !== 'healthy');
        const healthyCount = status.healthChecks.length - unhealthyChecks.length;
        return `
      <div class="status-card">
        <h3>Service Health Checks</h3>
        ${unhealthyChecks.map(check => `
          <div class="info-row">
            <span class="label">${check.name}:</span>
            <span class="value">
              <span class="status-badge ${check.status}">${check.status}</span>
              ${check.responseTime ? `${check.responseTime}ms` : ''}
              ${check.error ? `<span class="check-error" title="${check.error}">(!)</span>` : ''}
            </span>
          </div>
        `).join('')}
        ${healthyCount > 0 ? `
          <div class="info-row healthy-summary">
            <span class="label">Healthy:</span>
            <span class="value"><span class="status-badge healthy">${healthyCount} service${healthyCount !== 1 ? 's' : ''} healthy</span></span>
          </div>
        ` : ''}
      </div>`;
      })() : ''}

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
(window as any).rebootNode = rebootNode;
(window as any).shutdownNode = shutdownNode;
(window as any).runAptCommand = runAptCommand;

// Dropdown menu functions
function toggleDropdown(nodeName: string) {
  const dropdown = document.getElementById(`dropdown-${nodeName}`);
  if (!dropdown) return;
  
  // Close other dropdowns and remove elevated state from cards
  document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
    if (menu.id !== `dropdown-${nodeName}`) {
      menu.classList.remove('show');
      // Remove elevated state from parent card
      const parentCard = menu.closest('.node-card, .device-card');
      if (parentCard) {
        parentCard.classList.remove('dropdown-open');
      }
    }
  });
  
  // Toggle current dropdown
  const isOpening = !dropdown.classList.contains('show');
  dropdown.classList.toggle('show');
  
  // Toggle elevated state on parent card
  const parentCard = dropdown.closest('.node-card, .device-card');
  if (parentCard) {
    if (isOpening) {
      parentCard.classList.add('dropdown-open');
    } else {
      parentCard.classList.remove('dropdown-open');
    }
  }
}

(window as any).toggleDropdown = toggleDropdown;

// Command modal functions
let currentNodeName = '';

function openCommandModal(nodeName: string) {
  currentNodeName = nodeName;
  const modal = document.getElementById('command-modal');
  const nodeNameInput = document.getElementById('modal-node-name') as HTMLInputElement;
  const commandInput = document.getElementById('modal-command') as HTMLTextAreaElement;
  const outputDisplay = document.getElementById('modal-output');
  
  if (modal && nodeNameInput && commandInput && outputDisplay) {
    nodeNameInput.value = nodeName;
    commandInput.value = '';
    outputDisplay.style.display = 'none';
    outputDisplay.textContent = '';
    modal.classList.add('show');
  }
}

function closeCommandModal() {
  const modal = document.getElementById('command-modal');
  const commandInput = document.getElementById('modal-command') as HTMLTextAreaElement;
  const outputDisplay = document.getElementById('modal-output');
  
  if (modal) {
    modal.classList.remove('show');
  }
  
  if (commandInput) {
    commandInput.value = '';
  }
  
  if (outputDisplay) {
    outputDisplay.style.display = 'none';
    outputDisplay.textContent = '';
  }
  
  currentNodeName = '';
}

async function executeCommand() {
  const commandInput = document.getElementById('modal-command') as HTMLTextAreaElement;
  const outputDisplay = document.getElementById('modal-output') as HTMLDivElement;
  const executeBtn = document.querySelector('#command-modal .btn-primary') as HTMLButtonElement;
  
  if (!commandInput || !outputDisplay || !executeBtn) return;
  
  const command = commandInput.value.trim();
  
  if (!command) {
    alert('Please enter a command to execute.');
    return;
  }
  
  if (!currentNodeName) {
    alert('No node selected.');
    return;
  }
  
  try {
    // Disable button and show loading
    executeBtn.disabled = true;
    executeBtn.textContent = 'Executing...';
    outputDisplay.style.display = 'block';
    outputDisplay.textContent = 'Running command...\nPlease wait...';
    
    const output = await window.electronAPI.k8s.runSSHCommand(currentNodeName, command);
    
    // Show output
    outputDisplay.textContent = output;
    outputDisplay.scrollTop = outputDisplay.scrollHeight;
    
  } catch (error) {
    outputDisplay.textContent = `Error: ${(error as Error).message}`;
    outputDisplay.style.color = '#ef4444';
  } finally {
    // Re-enable button
    executeBtn.disabled = false;
    executeBtn.textContent = 'Execute';
    setTimeout(() => {
      if (outputDisplay) {
        outputDisplay.style.color = '#f3f4f6';
      }
    }, 100);
  }
}

// APT modal functions
let currentAptNodeName = '';

function openAptModal(nodeName: string) {
  currentAptNodeName = nodeName;
  const modal = document.getElementById('apt-modal');
  const nodeNameInput = document.getElementById('apt-node-name') as HTMLInputElement;
  const commandSelect = document.getElementById('apt-command') as HTMLSelectElement;
  const outputDisplay = document.getElementById('apt-output');
  
  if (modal && nodeNameInput && commandSelect && outputDisplay) {
    nodeNameInput.value = nodeName;
    commandSelect.selectedIndex = 0;
    outputDisplay.style.display = 'none';
    outputDisplay.textContent = '';
    modal.classList.add('show');
  }
}

function closeAptModal() {
  const modal = document.getElementById('apt-modal');
  const commandSelect = document.getElementById('apt-command') as HTMLSelectElement;
  const outputDisplay = document.getElementById('apt-output');
  
  if (modal) {
    modal.classList.remove('show');
  }
  
  if (commandSelect) {
    commandSelect.selectedIndex = 0;
  }
  
  if (outputDisplay) {
    outputDisplay.style.display = 'none';
    outputDisplay.textContent = '';
  }
  
  currentAptNodeName = '';
}

async function executeAptCommand() {
  const commandSelect = document.getElementById('apt-command') as HTMLSelectElement;
  const outputDisplay = document.getElementById('apt-output') as HTMLDivElement;
  const executeBtn = document.querySelector('#apt-modal .btn-primary') as HTMLButtonElement;
  
  if (!commandSelect || !outputDisplay || !executeBtn) return;
  
  const command = commandSelect.value;
  
  if (!command) {
    alert('Please select a command to execute.');
    return;
  }
  
  if (!currentAptNodeName) {
    alert('No node selected.');
    return;
  }
  
  const confirmMsg = command === 'upgrade' || command === 'dist-upgrade'
    ? `Are you sure you want to run "apt-get ${command}" on ${currentAptNodeName}?\n\nThis may take several minutes and could restart services.`
    : `Run "apt-get ${command}" on ${currentAptNodeName}?`;

  if (!confirm(confirmMsg)) return;
  
  try {
    // Disable button and show loading
    executeBtn.disabled = true;
    executeBtn.textContent = 'Executing...';
    outputDisplay.style.display = 'block';
    outputDisplay.textContent = `Running apt ${command}...\nPlease wait, this may take a while...`;
    
    const output = await window.electronAPI.k8s.runAptCommand(currentAptNodeName, command);
    
    // Show output
    outputDisplay.textContent = output;
    outputDisplay.scrollTop = outputDisplay.scrollHeight;
    
    // Reload nodes after a short delay
    setTimeout(() => {
      loadK8sNodes();
    }, 1000);
    
  } catch (error) {
    outputDisplay.textContent = `Error: ${(error as Error).message}`;
    outputDisplay.style.color = '#ef4444';
  } finally {
    // Re-enable button
    executeBtn.disabled = false;
    executeBtn.textContent = 'Execute';
    setTimeout(() => {
      if (outputDisplay) {
        outputDisplay.style.color = '#f3f4f6';
      }
    }, 100);
  }
}

(window as any).openCommandModal = openCommandModal;
(window as any).closeCommandModal = closeCommandModal;
(window as any).executeCommand = executeCommand;
(window as any).openAptModal = openAptModal;
(window as any).closeAptModal = closeAptModal;
(window as any).executeAptCommand = executeAptCommand;
// ============================================================================
// Auto-Update Handlers
// ============================================================================

let updateInfo: any = null;

function showUpdateModal(title: string, message: string) {
  const modal = document.getElementById('update-modal');
  const titleEl = document.getElementById('update-title');
  const messageEl = document.getElementById('update-message');
  
  if (modal && titleEl && messageEl) {
    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.style.display = 'flex';
  }
}

function closeUpdateModal() {
  const modal = document.getElementById('update-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

async function downloadUpdate() {
  const downloadBtn = document.getElementById('update-download-btn');
  const progressDiv = document.getElementById('update-progress');
  
  if (downloadBtn) downloadBtn.style.display = 'none';
  if (progressDiv) progressDiv.style.display = 'block';
  
  try {
    await window.electronAPI.update.download();
  } catch (error) {
    alert(`Update download failed: ${(error as Error).message}`);
    closeUpdateModal();
  }
}

async function installUpdate() {
  try {
    await window.electronAPI.update.install();
  } catch (error) {
    alert(`Update installation failed: ${(error as Error).message}`);
  }
}

// Register update event listeners
window.electronAPI.update.onChecking(() => {
  console.log('Checking for updates...');
});

window.electronAPI.update.onAvailable((event: any, info: any) => {
  console.log('Update available:', info);
  updateInfo = info;
  showUpdateModal(
    'Update Available',
    `Version ${info.version} is available. Would you like to download it?`
  );
});

window.electronAPI.update.onNotAvailable((event: any, info: any) => {
  console.log('No updates available', info);
});

window.electronAPI.update.onError((event: any, error: string) => {
  // Silently ignore "latest-mac.yml not found" — this is transient while CI is still building
  if (error.includes('latest-mac.yml') || error.includes('Cannot find latest')) {
    console.warn('Update check skipped: release artifacts not yet available');
    return;
  }
  console.error('Update error:', error);
  alert(`Update error: ${error}`);
});

window.electronAPI.update.onDownloadProgress((event: any, progress: any) => {
  console.log('Download progress:', progress);
  const progressBar = document.getElementById('update-progress-bar');
  const progressText = document.getElementById('update-progress-text');
  
  if (progressBar) {
    progressBar.style.width = `${progress.percent}%`;
  }
  
  if (progressText) {
    const mbTransferred = (progress.transferred / 1024 / 1024).toFixed(2);
    const mbTotal = (progress.total / 1024 / 1024).toFixed(2);
    const speed = (progress.bytesPerSecond / 1024 / 1024).toFixed(2);
    progressText.textContent = `Downloading: ${mbTransferred}MB / ${mbTotal}MB (${speed}MB/s)`;
  }
});

window.electronAPI.update.onDownloaded((event: any, info: any) => {
  console.log('Update downloaded:', info);
  const messageEl = document.getElementById('update-message');
  const progressDiv = document.getElementById('update-progress');
  const laterBtn = document.getElementById('update-later-btn');
  const installBtn = document.getElementById('update-install-btn');
  
  if (messageEl) {
    messageEl.textContent = 'Update downloaded and ready to install!';
  }
  
  if (progressDiv) progressDiv.style.display = 'none';
  if (laterBtn) laterBtn.textContent = 'Cancel';
  if (installBtn) installBtn.style.display = 'inline-block';
});

// Make update functions global
(window as any).closeUpdateModal = closeUpdateModal;
(window as any).downloadUpdate = downloadUpdate;
(window as any).installUpdate = installUpdate;