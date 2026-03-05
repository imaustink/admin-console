import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import { getLogger, closeLogger, isLoggerClosed } from './utils/logger';
import { exec } from 'child_process';
import * as https from 'https';
import * as os from 'os';

// Check if running in test mode
const TEST_MODE = process.env.TEST_MODE === 'true' || process.env.NODE_ENV === 'test';

const logger = getLogger();
let mainWindow: BrowserWindow | null = null;

// Configure auto-updater
autoUpdater.logger = logger;
autoUpdater.autoDownload = false; // Manual download trigger
autoUpdater.autoInstallOnAppQuit = true;

// Capture the real isPackaged value before it may be overridden below
const isPackaged = app.isPackaged;

// For personal use without Apple Developer account
if (process.platform === 'darwin') {
  process.env.ELECTRON_UPDATER_ALLOW_DOWNGRADE = 'true';
  Object.defineProperty(app, 'isPackaged', {
    get() {
      return true;
    }
  });
}

// Load configuration
let config: any = {};
try {
  let configPath: string;

  if (process.env.CONFIG_PATH) {
    // Allow explicit override via environment variable
    configPath = process.env.CONFIG_PATH;
  } else if (!isPackaged) {
    // Development: load from project root
    configPath = path.join(__dirname, '../config.json');
  } else {
    // Production: load from user data directory (writable, persistent)
    const userDataPath = app.getPath('userData');
    configPath = path.join(userDataPath, 'config.json');

    // Always ensure userData directory exists
    fs.mkdirSync(userDataPath, { recursive: true });

    // On first run, seed config from bundled example
    if (!fs.existsSync(configPath)) {
      const examplePath = path.join(process.resourcesPath, 'config.example.json');
      if (fs.existsSync(examplePath)) {
        fs.copyFileSync(examplePath, configPath);
        logger.info(`Created config file from example: ${configPath}`);
      } else {
        logger.warn(`No config.example.json found in resources. Please create config at: ${configPath}`);
      }
    }
  }

  logger.info(`Loading configuration from: ${configPath}`);
  const configData = fs.readFileSync(configPath, 'utf-8');
  config = JSON.parse(configData);
  logger.info('Configuration loaded successfully');
} catch (error) {
  logger.error('Failed to load config.json', error);
  const userDataPath = isPackaged ? app.getPath('userData') : path.join(__dirname, '..');
  console.error(`❌ Failed to load config.json. Please ensure it exists at: ${path.join(userDataPath, 'config.json')}`);
}

// Singleton controller instances — created once so cookies/sessions are reused across IPC calls
let unifiController: any = null;
function getUnifiController() {
  if (!unifiController) {
    const unifiConfig = config.unifi || {};
    if (TEST_MODE) {
      const { UnifiControllerMock } = require('./controllers/mock/unifi-mock');
      unifiController = new UnifiControllerMock('mock-host', 8443, 'admin', 'mock-password', 'default');
    } else {
      const { UnifiController } = require('./controllers/unifi');
      const cacheDir = path.join(app.getPath('userData'), 'cache');
      unifiController = new UnifiController(
        unifiConfig.host,
        unifiConfig.port,
        unifiConfig.username,
        unifiConfig.password,
        unifiConfig.site,
        cacheDir
      );
    }
  }
  return unifiController;
}

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
  if (!isLoggerClosed()) {
    logger.error('Uncaught Exception in Main Process', error);
  }
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  if (!isLoggerClosed()) {
    logger.error('Unhandled Promise Rejection in Main Process', { reason, promise });
  }
  console.error('Unhandled Rejection:', reason);
});

function createWindow(): void {
  // Get primary display dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.floor(width * 0.9),
    height: Math.floor(height * 0.9),
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Performance optimizations for Pi 3
      enableWebSQL: false,
      offscreen: false,
      backgroundThrottling: false,
    },
    title: 'Homelab Dashboard',
    center: true,
  });

  logger.info('Window created', { width, height, testMode: TEST_MODE });

  mainWindow.loadFile(path.join(__dirname, '../index.html'));

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Show test mode indicator
  if (TEST_MODE) {
    logger.info('🧪 Running in TEST MODE - using mock controllers');
    console.log('🧪 Running in TEST MODE - using mock controllers');
    mainWindow.setTitle('Homelab Dashboard [TEST MODE]');
  }

  // Log when content finishes loading
  mainWindow.webContents.on('did-finish-load', () => {
    logger.info('Window content loaded successfully');
  });

  // Log renderer process console messages
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const logLevel = ['debug', 'info', 'warn', 'error'][level] || 'info';
    logger.log(logLevel, `[Renderer] ${message}`, { line, sourceId });
  });

  mainWindow.on('closed', () => {
    if (!isLoggerClosed()) {
      logger.info('Window closed');
    }
    mainWindow = null;
  });
}

// Optimize for Raspberry Pi 3 performance
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('enable-low-end-device-mode');
app.commandLine.appendSwitch('disable-smooth-scrolling');
app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');
app.disableHardwareAcceleration();

app.whenReady().then(() => {
  logger.info('App ready, creating window');
  logger.info(`Log file: ${logger.getLogFile()}`);
  console.log(`📝 Log file: ${logger.getLogFile()}`);
  
  createWindow();

  // Initialize auto-updater (skip in test mode and development)
  // Check if running from node_modules (development) or actual packaged app
  const isDevMode = process.execPath.includes('node_modules');
  if (!TEST_MODE && !isDevMode && process.env.NODE_ENV !== 'development') {
    logger.info('Initializing auto-updater');
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        logger.error('Auto-update check failed', err);
      });
    }, 3000); // Check after 3 seconds to let app load first
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(err => {
        logger.error('Auto-update periodic check failed', err);
      });
    }, 1 * 60 * 1000); // Check every 5 minutes
  } else {
    logger.info('Skipping auto-updater (development mode)');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      logger.info('Activating app, creating new window');
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (!isLoggerClosed()) {
    logger.info('All windows closed');
  }
  if (process.platform !== 'darwin') {
    closeLogger();
    app.quit();
  }
});

app.on('before-quit', () => {
  if (!isLoggerClosed()) {
    logger.info('App quitting');
  }
});

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
  logger.info('Checking for update...');
  mainWindow?.webContents.send('update:checking');
});

let pendingUpdateInfo: any = null;

autoUpdater.on('update-available', (info) => {
  logger.info('Update available', info);
  pendingUpdateInfo = info;
  mainWindow?.webContents.send('update:available', info);
});

autoUpdater.on('update-not-available', (info) => {
  logger.info('Update not available', info);
  mainWindow?.webContents.send('update:not-available', info);
});

autoUpdater.on('error', (err) => {
  logger.error('Update error', err);
  mainWindow?.webContents.send('update:error', err.message);
});

autoUpdater.on('download-progress', (progressObj) => {
  logger.info('Download progress',  progressObj);
  mainWindow?.webContents.send('update:download-progress', progressObj);
});

let downloadedUpdateFile: string | null = null;

autoUpdater.on('update-downloaded', (info) => {
  logger.info('Update downloaded', info);
  downloadedUpdateFile = (info as any).downloadedFile || null;
  mainWindow?.webContents.send('update:downloaded', info);
});

// Manually download a URL to destPath, following redirects, with progress callbacks.
function downloadFile(url: string, destPath: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (currentUrl: string) => {
      https.get(currentUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          attempt(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed with status ${res.statusCode}`));
          return;
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;
        const file = fs.createWriteStream(destPath);
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (total > 0) onProgress(Math.round((received / total) * 100));
        });
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', reject);
      }).on('error', reject);
    };
    attempt(url);
  });
}

// IPC Handlers for Updates
ipcMain.handle('update:check', async () => {
  try {
    logger.info('IPC: update:check called');
    // Skip update checks in development mode
    const isDevMode = process.execPath.includes('node_modules');
    if (isDevMode || TEST_MODE || process.env.NODE_ENV === 'development') {
      logger.info('Skipping update check (development mode)');
      return null;
    }
    return await autoUpdater.checkForUpdates();
  } catch (error) {
    logger.error('IPC: update:check failed', error);
    throw error;
  }
});

ipcMain.handle('update:download', async () => {
  try {
    logger.info('IPC: update:download called');
    // On macOS, bypass Squirrel (which rejects unsigned apps) by downloading the zip directly.
    if (process.platform === 'darwin' && pendingUpdateInfo) {
      const tag: string = pendingUpdateInfo.tag;
      const filename: string = pendingUpdateInfo.path; // e.g. Homelab-Dashboard-2.0.7-universal-mac.zip
      const url = `https://github.com/imaustink/admin-console/releases/download/${tag}/${filename}`;
      const destPath = path.join(os.tmpdir(), filename);
      logger.info(`Downloading update directly: ${url} -> ${destPath}`);
      await downloadFile(url, destPath, (pct) => {
        mainWindow?.webContents.send('update:download-progress', { percent: pct });
      });
      downloadedUpdateFile = destPath;
      logger.info('Direct download complete', { destPath });
      mainWindow?.webContents.send('update:downloaded', pendingUpdateInfo);
      return;
    }
    return await autoUpdater.downloadUpdate();
  } catch (error) {
    logger.error('IPC: update:download failed', error);
    throw error;
  }
});

ipcMain.handle('update:install', async () => {
  try {
    logger.info('IPC: update:install called - app will quit and install');
    if (process.platform === 'darwin' && downloadedUpdateFile) {
      // Bypass Squirrel.Mac's code signature check by extracting the zip ourselves.
      // Squirrel requires a signed app; this approach uses ditto directly.
      const zipPath = downloadedUpdateFile;
      const appBundle = path.dirname(path.dirname(path.dirname(app.getAppPath())));
      const extractDir = path.join(require('os').tmpdir(), 'homelab-dashboard-update');
      const scriptPath = path.join(require('os').tmpdir(), 'homelab-update.sh');
      const script = [
        '#!/bin/bash',
        'sleep 2',
        `rm -rf "${extractDir}"`,
        `mkdir -p "${extractDir}"`,
        `ditto -xk "${zipPath}" "${extractDir}"`,
        `extracted_app=$(find "${extractDir}" -maxdepth 2 -name "*.app" | head -1)`,
        'if [ -z "$extracted_app" ]; then echo "No .app found in update zip" >&2; exit 1; fi',
        `rm -rf "${appBundle}"`,
        `ditto "$extracted_app" "${appBundle}"`,
        `rm -rf "${extractDir}"`,
        `open "${appBundle}"`,
      ].join('\n');
      fs.writeFileSync(scriptPath, script, { mode: 0o755 });
      exec(`bash "${scriptPath}" &`);
      app.quit();
    } else {
      autoUpdater.quitAndInstall(false, true);
    }
  } catch (error) {
    logger.error('IPC: update:install failed', error);
    throw error;
  }
});

ipcMain.handle('update:getVersion', async () => {
  return app.getVersion();
});

// IPC Handlers for Unifi
ipcMain.handle('unifi:getDevices', async () => {
  try {
    logger.info('IPC: unifi:getDevices called');
    return await getUnifiController().getDevices();
  } catch (error) {
    logger.error('IPC: unifi:getDevices failed', error);
    throw error;
  }
});

ipcMain.handle('unifi:updateFirmware', async (_, deviceId: string) => {
  try {
    logger.info('IPC: unifi:updateFirmware called', { deviceId });
    return await getUnifiController().updateFirmware(deviceId);
  } catch (error) {
    logger.error('IPC: unifi:updateFirmware failed', error);
    throw error;
  }
});

ipcMain.handle('unifi:powerCycle', async (_, deviceId: string) => {
  try {
    logger.info('IPC: unifi:powerCycle called', { deviceId });
    return await getUnifiController().powerCycle(deviceId);
  } catch (error) {
    logger.error('IPC: unifi:powerCycle failed', error);
    throw error;
  }
});

ipcMain.handle('unifi:getInternetStats', async () => {
  try {
    logger.info('IPC: unifi:getInternetStats called');
    return await getUnifiController().getInternetStats();
  } catch (error) {
    logger.error('IPC: unifi:getInternetStats failed', error);
    throw error;
  }
});

// IPC Handlers for Kubernetes
ipcMain.handle('k8s:getNodes', async () => {
  try {
    logger.info('IPC: k8s:getNodes called');
    if (TEST_MODE) {
      const { K8sControllerMock } = require('./controllers/mock/k8s-mock');
      const controller = new K8sControllerMock();
      return await controller.getNodes();
    }
    const { K8sController } = require('./controllers/k8s');
    const controller = new K8sController(config.kubernetes);
    return await controller.getNodes();
  } catch (error) {
    logger.error('IPC: k8s:getNodes failed', error);
    throw error;
  }
});

ipcMain.handle('k8s:checkResourceHealth', async (_, healthCheckConfig) => {
  try {
    logger.info('IPC: k8s:checkResourceHealth called', { config: healthCheckConfig });
    if (TEST_MODE) {
      const { K8sControllerMock } = require('./controllers/mock/k8s-mock');
      const controller = new K8sControllerMock();
      return await controller.checkResourceHealth(healthCheckConfig);
    }
    const { K8sController } = require('./controllers/k8s');
    const controller = new K8sController(config.kubernetes);
    return await controller.checkResourceHealth(healthCheckConfig);
  } catch (error) {
    logger.error('IPC: k8s:checkResourceHealth failed', error);
    throw error;
  }
});

ipcMain.handle('k8s:drainNode', async (_, nodeName: string) => {
  try {
    logger.info('IPC: k8s:drainNode called', { nodeName });
    if (TEST_MODE) {
      const { K8sControllerMock } = require('./controllers/mock/k8s-mock');
      const controller = new K8sControllerMock();
      return await controller.drainNode(nodeName);
    }
    const { K8sController } = require('./controllers/k8s');
    const controller = new K8sController(config.kubernetes);
    return await controller.drainNode(nodeName);
  } catch (error) {
    logger.error('IPC: k8s:drainNode failed', error);
    throw error;
  }
});

ipcMain.handle('k8s:uncordonNode', async (_, nodeName: string) => {
  try {
    logger.info('IPC: k8s:uncordonNode called', { nodeName });
    if (TEST_MODE) {
      const { K8sControllerMock } = require('./controllers/mock/k8s-mock');
      const controller = new K8sControllerMock();
      return await controller.uncordonNode(nodeName);
    }
    const { K8sController } = require('./controllers/k8s');
    const controller = new K8sController(config.kubernetes);
    return await controller.uncordonNode(nodeName);
  } catch (error) {
    logger.error('IPC: k8s:uncordonNode failed', error);
    throw error;
  }
});

ipcMain.handle('k8s:cordonNode', async (_, nodeName: string) => {
  try {
    logger.info('IPC: k8s:cordonNode called', { nodeName });
    if (TEST_MODE) {
      const { K8sControllerMock } = require('./controllers/mock/k8s-mock');
      const controller = new K8sControllerMock();
      return await controller.cordonNode(nodeName);
    }
    const { K8sController } = require('./controllers/k8s');
    const controller = new K8sController(config.kubernetes);
    return await controller.cordonNode(nodeName);
  } catch (error) {
    logger.error('IPC: k8s:cordonNode failed', error);
    throw error;
  }
});

ipcMain.handle('k8s:getNodePortMappings', async () => {
  try {
    logger.info('IPC: k8s:getNodePortMappings called');
    if (TEST_MODE) {
      const { K8sControllerMock } = require('./controllers/mock/k8s-mock');
      const { PortMapperControllerMock } = require('./controllers/mock/port-mapper-mock');
      const k8sController = new K8sControllerMock();
      const nodes = await k8sController.getNodes();
      const controller = new PortMapperControllerMock(getUnifiController());
      return await controller.getNodePortMappings(nodes);
    }
    const { PortMapperController } = require('./controllers/port-mapper');
    const { K8sController } = require('./controllers/k8s');
    const k8sController = new K8sController(config.kubernetes);
    const nodes = await k8sController.getNodes();
    const controller = new PortMapperController(getUnifiController());
    return await controller.getNodePortMappings(nodes);
  } catch (error) {
    logger.error('IPC: k8s:getNodePortMappings failed', error);
    throw error;
  }
});
ipcMain.handle('k8s:rebootNodeSSH', async (_, nodeName: string, nodeIp: string) => {
  try {
    logger.info('IPC: k8s:rebootNodeSSH called', { nodeName, nodeIp });
    if (!nodeIp) throw new Error('Node IP is required for SSH reboot');
    // You may want to use config for SSH user, or default to 'root'
    const sshUser = (config.k8s && config.k8s.sshUser) || 'root';
    const sshCmd = `ssh -o StrictHostKeyChecking=no ${sshUser}@${nodeIp} 'sudo reboot'`;
    logger.info(`Executing SSH reboot: ${sshCmd}`);
    return new Promise((resolve, reject) => {
      exec(sshCmd, (error, stdout, stderr) => {
        if (error) {
          logger.error('SSH reboot failed', { error, stderr });
          reject(new Error(stderr || error.message));
        } else {
          logger.info('SSH reboot succeeded', { stdout });
          resolve(stdout);
        }
      });
    });
  } catch (error) {
    logger.error('IPC: k8s:rebootNodeSSH failed', error);
    throw error;
  }
});

ipcMain.handle('k8s:powerCycleNodePort', async (_, nodeName: string) => {
  try {
    logger.info('IPC: k8s:powerCycleNodePort called', { nodeName });
    if (TEST_MODE) {
      const { PortMapperControllerMock } = require('./controllers/mock/port-mapper-mock');
      const controller = new PortMapperControllerMock(getUnifiController());
      return await controller.powerCycleNodePort(nodeName);
    }
    const { PortMapperController } = require('./controllers/port-mapper');
    const controller = new PortMapperController(getUnifiController());
    return await controller.powerCycleNodePort(nodeName);
  } catch (error) {
    logger.error('IPC: k8s:powerCycleNodePort failed', error);
    throw error;
  }
});

ipcMain.handle('k8s:rebootNode', async (_, nodeName: string) => {
  try {
    logger.info('IPC: k8s:rebootNode called', { nodeName });
    if (TEST_MODE) {
      const { K8sControllerMock } = require('./controllers/mock/k8s-mock');
      const controller = new K8sControllerMock();
      return await controller.rebootNode(nodeName);
    }
    const { K8sController } = require('./controllers/k8s');
    const controller = new K8sController(config.kubernetes);
    return await controller.rebootNode(nodeName);
  } catch (error) {
    logger.error('IPC: k8s:rebootNode failed', error);
    throw error;
  }
});

ipcMain.handle('k8s:shutdownNode', async (_, nodeName: string) => {
  try {
    logger.info('IPC: k8s:shutdownNode called', { nodeName });
    if (TEST_MODE) {
      const { K8sControllerMock } = require('./controllers/mock/k8s-mock');
      const controller = new K8sControllerMock();
      return await controller.shutdownNode(nodeName);
    }
    const { K8sController } = require('./controllers/k8s');
    const controller = new K8sController(config.kubernetes);
    return await controller.shutdownNode(nodeName);
  } catch (error) {
    logger.error('IPC: k8s:shutdownNode failed', error);
    throw error;
  }
});

ipcMain.handle('k8s:runAptCommand', async (_, nodeName: string, command: string) => {
  try {
    logger.info('IPC: k8s:runAptCommand called', { nodeName, command });
    if (TEST_MODE) {
      const { K8sControllerMock } = require('./controllers/mock/k8s-mock');
      const controller = new K8sControllerMock();
      // Mock implementation
      return `[MOCK] Successfully ran apt ${command} on node ${nodeName}`;
    }
    const { K8sController } = require('./controllers/k8s');
    const controller = new K8sController(config.kubernetes);
    return await controller.runAptCommand(nodeName, command);
  } catch (error) {
    logger.error('IPC: k8s:runAptCommand failed', error);
    throw error;
  }
});

ipcMain.handle('k8s:runSSHCommand', async (_, nodeName: string, command: string) => {
  try {
    logger.info('IPC: k8s:runSSHCommand called', { nodeName, command });
    if (TEST_MODE) {
      const { K8sControllerMock } = require('./controllers/mock/k8s-mock');
      const controller = new K8sControllerMock();
      return await controller.runSSHCommand(nodeName, command);
    }
    const { K8sController } = require('./controllers/k8s');
    const controller = new K8sController(config.kubernetes);
    return await controller.runSSHCommand(nodeName, command);
  } catch (error) {
    logger.error('IPC: k8s:runSSHCommand failed', error);
    throw error;
  }
});

// IPC Handlers for Status
ipcMain.handle('status:getSystemStatus', async () => {
  try {
    logger.info('IPC: status:getSystemStatus called');
    if (TEST_MODE) {
      const { K8sControllerMock } = require('./controllers/mock/k8s-mock');
      
      const unifiController = getUnifiController();
      const k8sController = new K8sControllerMock();
      
      const [devices, nodes, internetStats] = await Promise.all([
        unifiController.getDevices(),
        k8sController.getNodes(),
        unifiController.getInternetStats()
      ]);

      // Get all K8s resources (auto-discovery)
      const allResources = await k8sController.getAllK8sResources();
      
      // Apply filters if configured
      const resourceFilters = config.kubernetes?.resourceFilters || [];
      let resourceHealth = allResources;
      
      if (resourceFilters.length > 0) {
        resourceHealth = allResources.filter((resource: any) => {
          return !resourceFilters.some((filter: any) => 
            filter.kind === resource.kind &&
            filter.name === resource.name &&
            filter.namespace === resource.namespace
          );
        });
      }

      // Mock HTTP health checks
      const mockHealthChecks = [
        {
          name: 'Google DNS',
          url: 'https://dns.google',
          status: 'healthy' as const,
          statusCode: 200,
          responseTime: 45,
          lastChecked: new Date(),
          hidden: false
        }
      ];
      
      return {
        unifi: {
          connected: true,
          deviceCount: devices.length,
          internet: internetStats
        },
        k8s: {
          connected: true,
          nodeCount: nodes.length,
          readyNodes: nodes.filter((n: any) => n.status === 'Ready').length,
          resourceHealth: resourceHealth
        },
        healthChecks: mockHealthChecks
      };
    }
    const { StatusController } = require('./controllers/status');
    const { K8sController } = require('./controllers/k8s');
    
    const unifiController = getUnifiController();
    const k8sController = new K8sController(config.kubernetes);
    
    try {
      const [devices, nodes, internetStats] = await Promise.all([
        unifiController.getDevices().catch(() => []),
        k8sController.getNodes().catch(() => []),
        unifiController.getInternetStats().catch(() => null)
      ]);
      
      // Get K8s resource health - auto-discover all resources
      let resourceHealth: any[] = [];
      
      try {
        // Get all K8s resources (deployments, statefulsets, daemonsets)
        const allResources = await k8sController.getAllK8sResources();
        
        // Apply filters if configured
        const resourceFilters = config.kubernetes?.resourceFilters || [];
        
        if (resourceFilters.length > 0) {
          // Filter out hidden resources
          resourceHealth = allResources.filter((resource: any) => {
            return !resourceFilters.some((filter: any) => 
              filter.kind === resource.kind &&
              filter.name === resource.name &&
              filter.namespace === resource.namespace
            );
          });
          logger.info(`Filtered ${allResources.length - resourceHealth.length} K8s resources based on config`);
        } else {
          resourceHealth = allResources;
        }
        
        logger.info(`Displaying ${resourceHealth.length} K8s resources on status page`);
      } catch (error: any) {
        logger.warn('Failed to get K8s resources for status page:', error.message);
        resourceHealth = [];
      }
      
      // Get HTTP health checks
      const healthCheckConfigs = config.healthChecks || [];
      const healthChecks = await Promise.all(
        healthCheckConfigs
          .filter((cfg: any) => !cfg.hidden)
          .map(async (cfg: any) => {
            const startTime = Date.now();
            try {
              const axios = require('axios');
              const response = await axios.get(cfg.url, {
                timeout: 10000,
                validateStatus: () => true,
              });
              const responseTime = Date.now() - startTime;
              return {
                name: cfg.name,
                url: cfg.url,
                status: response.status >= 200 && response.status < 300 ? 'healthy' : 'unhealthy',
                statusCode: response.status,
                responseTime,
                timestamp: Date.now()
              };
            } catch (error: any) {
              const responseTime = Date.now() - startTime;
              return {
                name: cfg.name,
                url: cfg.url,
                status: 'unhealthy' as const,
                statusCode: 0,
                responseTime,
                timestamp: Date.now(),
                error: error.message
              };
            }
          })
      );
      
      return {
        unifi: {
          connected: devices.length > 0,
          deviceCount: devices.length,
          internet: internetStats
        },
        k8s: {
          connected: nodes.length > 0,
          nodeCount: nodes.length,
          readyNodes: nodes.filter((n: any) => n.status === 'Ready').length,
          resourceHealth
        },
        healthChecks
      };
    } catch (error) {
      logger.error('Error getting system status', error);
      throw error;
    }
  } catch (error) {
    logger.error('IPC: status:getSystemStatus failed', error);
    throw error;
  }
});

ipcMain.handle('status:checkHealth', async (_, url: string) => {
  try {
    logger.info('IPC: status:checkHealth called', { url });
    const { StatusController } = require('./controllers/status');
    const controller = new StatusController();
    return await controller.checkHealth(url);
  } catch (error) {
    logger.error('IPC: status:checkHealth failed', error);
    throw error;
  }
});

// IPC Handler for App Exit
ipcMain.handle('app:exit', async () => {
  try {
    logger.info('User requested application exit');
    closeLogger();
    app.quit();
  } catch (error) {
    logger.error('IPC: app:exit failed', error);
    throw error;
  }
});
