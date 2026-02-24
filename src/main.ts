import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getLogger, closeLogger } from './utils/logger';

// Check if running in test mode
const TEST_MODE = process.env.TEST_MODE === 'true' || process.env.NODE_ENV === 'test';

const logger = getLogger();
let mainWindow: BrowserWindow | null = null;

// Load configuration
let config: any = {};
try {
  // Support CONFIG_PATH environment variable for production deployments
  const configPath = process.env.CONFIG_PATH || path.join(__dirname, '../config.json');
  logger.info(`Loading configuration from: ${configPath}`);
  const configData = fs.readFileSync(configPath, 'utf-8');
  config = JSON.parse(configData);
  logger.info('Configuration loaded successfully');
} catch (error) {
  logger.error('Failed to load config.json', error);
  console.error('❌ Failed to load config.json. Please ensure it exists and is valid.');
}

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception in Main Process', error);
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection in Main Process', { reason, promise });
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
    logger.info('Window closed');
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      logger.info('Activating app, creating new window');
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  logger.info('All windows closed');
  if (process.platform !== 'darwin') {
    closeLogger();
    app.quit();
  }
});

app.on('before-quit', () => {
  logger.info('App quitting');
  closeLogger();
});

// IPC Handlers for Unifi
ipcMain.handle('unifi:getDevices', async () => {
  try {
    logger.info('IPC: unifi:getDevices called');
    if (TEST_MODE) {
      const { UnifiControllerMock } = require('./controllers/mock/unifi-mock');
      const controller = new UnifiControllerMock('mock-host', 8443, 'admin', 'mock-password', 'default');
      return await controller.getDevices();
    }
    const { UnifiController } = require('./controllers/unifi');
    const unifiConfig = config.unifi || {};
    const controller = new UnifiController(
      unifiConfig.host,
      unifiConfig.port,
      unifiConfig.username,
      unifiConfig.password,
      unifiConfig.site
    );
    return await controller.getDevices();
  } catch (error) {
    logger.error('IPC: unifi:getDevices failed', error);
    throw error;
  }
});

ipcMain.handle('unifi:updateFirmware', async (_, deviceId: string) => {
  try {
    logger.info('IPC: unifi:updateFirmware called', { deviceId });
    if (TEST_MODE) {
      const { UnifiControllerMock } = require('./controllers/mock/unifi-mock');
      const controller = new UnifiControllerMock('mock-host', 8443, 'admin', 'mock-password', 'default');
      return await controller.updateFirmware(deviceId);
    }
    const { UnifiController } = require('./controllers/unifi');
    const unifiConfig = config.unifi || {};
    const controller = new UnifiController(
      unifiConfig.host,
      unifiConfig.port,
      unifiConfig.username,
      unifiConfig.password,
      unifiConfig.site
    );
    return await controller.updateFirmware(deviceId);
  } catch (error) {
    logger.error('IPC: unifi:updateFirmware failed', error);
    throw error;
  }
});

ipcMain.handle('unifi:powerCycle', async (_, deviceId: string) => {
  try {
    logger.info('IPC: unifi:powerCycle called', { deviceId });
    if (TEST_MODE) {
      const { UnifiControllerMock } = require('./controllers/mock/unifi-mock');
      const controller = new UnifiControllerMock('mock-host', 8443, 'admin', 'mock-password', 'default');
      return await controller.powerCycle(deviceId);
    }
    const { UnifiController } = require('./controllers/unifi');
    const unifiConfig = config.unifi || {};
    const controller = new UnifiController(
      unifiConfig.host,
      unifiConfig.port,
      unifiConfig.username,
      unifiConfig.password,
      unifiConfig.site
    );
    return await controller.powerCycle(deviceId);
  } catch (error) {
    logger.error('IPC: unifi:powerCycle failed', error);
    throw error;
  }
});

ipcMain.handle('unifi:getInternetStats', async () => {
  try {
    logger.info('IPC: unifi:getInternetStats called');
    if (TEST_MODE) {
      const { UnifiControllerMock } = require('./controllers/mock/unifi-mock');
      const controller = new UnifiControllerMock('mock-host', 8443, 'admin', 'mock-password', 'default');
      return await controller.getInternetStats();
    }
    const { UnifiController } = require('./controllers/unifi');
    const unifiConfig = config.unifi || {};
    const controller = new UnifiController(
      unifiConfig.host,
      unifiConfig.port,
      unifiConfig.username,
      unifiConfig.password,
      unifiConfig.site
    );
    return await controller.getInternetStats();
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
      const { UnifiControllerMock } = require('./controllers/mock/unifi-mock');
      const { K8sControllerMock } = require('./controllers/mock/k8s-mock');
      const { PortMapperControllerMock } = require('./controllers/mock/port-mapper-mock');
      const unifiController = new UnifiControllerMock('mock-host', 8443, 'admin', 'mock-password', 'default');
      const k8sController = new K8sControllerMock();
      const nodes = await k8sController.getNodes();
      const controller = new PortMapperControllerMock(unifiController);
      return await controller.getNodePortMappings(nodes);
    }
    const { PortMapperController } = require('./controllers/port-mapper');
    const { K8sController } = require('./controllers/k8s');
    const unifiConfig = config.unifi || {};
    const { UnifiController } = require('./controllers/unifi');
    const unifiController = new UnifiController(
      unifiConfig.host,
      unifiConfig.port,
      unifiConfig.username,
      unifiConfig.password,
      unifiConfig.site
    );
    const k8sController = new K8sController(config.kubernetes);
    const nodes = await k8sController.getNodes();
    const controller = new PortMapperController(unifiController);
    return await controller.getNodePortMappings(nodes);
  } catch (error) {
    logger.error('IPC: k8s:getNodePortMappings failed', error);
    throw error;
  }
});

ipcMain.handle('k8s:powerCycleNodePort', async (_, nodeName: string) => {
  try {
    logger.info('IPC: k8s:powerCycleNodePort called', { nodeName });
    if (TEST_MODE) {
      const { UnifiControllerMock } = require('./controllers/mock/unifi-mock');
      const { PortMapperControllerMock } = require('./controllers/mock/port-mapper-mock');
      const unifiController = new UnifiControllerMock('mock-host', 8443, 'admin', 'mock-password', 'default');
      const controller = new PortMapperControllerMock(unifiController);
      return await controller.powerCycleNodePort(nodeName);
    }
    const { PortMapperController } = require('./controllers/port-mapper');
    const unifiConfig = config.unifi || {};
    const { UnifiController } = require('./controllers/unifi');
    const unifiController = new UnifiController(
      unifiConfig.host,
      unifiConfig.port,
      unifiConfig.username,
      unifiConfig.password,
      unifiConfig.site
    );
    const controller = new PortMapperController(unifiController);
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

// IPC Handlers for Status
ipcMain.handle('status:getSystemStatus', async () => {
  try {
    logger.info('IPC: status:getSystemStatus called');
    if (TEST_MODE) {
      const { UnifiControllerMock } = require('./controllers/mock/unifi-mock');
      const { K8sControllerMock } = require('./controllers/mock/k8s-mock');
      
      const unifiController = new UnifiControllerMock('mock-host', 8443, 'admin', 'mock-password', 'default');
      const k8sController = new K8sControllerMock();
      
      const [devices, nodes, internetStats] = await Promise.all([
        unifiController.getDevices(),
        k8sController.getNodes(),
        unifiController.getInternetStats()
      ]);

      // Check for K8s resource health in test mode
      const k8sHealthChecks = [
        { name: 'nginx-deployment', namespace: 'default', kind: 'Deployment' as const, interval: 30000, hidden: false },
        { name: 'redis-statefulset', namespace: 'default', kind: 'StatefulSet' as const, interval: 30000, hidden: false }
      ];

      const resourceHealth = await Promise.all(
        k8sHealthChecks.map(config => k8sController.checkResourceHealth(config))
      );

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
          resourceHealth: resourceHealth.filter(h => !h.hidden)
        },
        healthChecks: mockHealthChecks
      };
    }
    const { StatusController } = require('./controllers/status');
    const { UnifiController } = require('./controllers/unifi');
    const { K8sController } = require('./controllers/k8s');
    
    const unifiConfig = config.unifi || {};
    const unifiController = new UnifiController(
      unifiConfig.host,
      unifiConfig.port,
      unifiConfig.username,
      unifiConfig.password,
      unifiConfig.site
    );
    
    const k8sController = new K8sController(config.kubernetes);
    
    try {
      const [devices, nodes, internetStats] = await Promise.all([
        unifiController.getDevices().catch(() => []),
        k8sController.getNodes().catch(() => []),
        unifiController.getInternetStats().catch(() => null)
      ]);
      
      // Get K8s resource health
      const k8sHealthChecks = config.k8sHealthChecks || [];
      const resourceHealth = await Promise.all(
        k8sHealthChecks.map((cfg: any) => 
          k8sController.checkResourceHealth(cfg).catch(() => null)
        )
      ).then(results => results.filter(r => r !== null && !r.hidden));
      
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
