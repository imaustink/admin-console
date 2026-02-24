import axios from 'axios';
import { HealthCheckResult, SystemStatus, HealthCheckConfig, K8sHealthCheckConfig } from '../types';
import { K8sController } from './k8s';
import logger from '../utils/logger';

export class StatusController {
  private healthCheckTimers: Map<string, NodeJS.Timeout> = new Map();
  private healthCheckResults: Map<string, HealthCheckResult> = new Map();
  private k8sHealthCheckResults: Map<string, any> = new Map();
  private k8sController: K8sController | null = null;

  constructor(k8sController?: K8sController) {
    this.k8sController = k8sController || null;
  }

  startHealthChecks(configs: HealthCheckConfig[]): void {
    logger.info('Starting health checks...');
    
    // Stop any existing timers
    this.stopHealthChecks();

    // Start new timers for each health check
    for (const config of configs) {
      this.runHealthCheck(config);
      
      const timer = setInterval(() => {
        this.runHealthCheck(config);
      }, config.interval);

      this.healthCheckTimers.set(config.name, timer);
      logger.info(`Started health check for ${config.name} with interval ${config.interval}ms`);
    }
  }

  startK8sHealthChecks(configs: K8sHealthCheckConfig[]): void {
    if (!this.k8sController) {
      logger.warn('K8s controller not available, skipping K8s health checks');
      return;
    }

    logger.info('Starting K8s health checks...');

    // Stop any existing timers
    this.stopK8sHealthChecks();

    // Start new timers for each K8s health check
    for (const config of configs) {
      this.runK8sHealthCheck(config);
      
      const timer = setInterval(() => {
        this.runK8sHealthCheck(config);
      }, config.interval);

      this.healthCheckTimers.set(`k8s-${config.name}`, timer);
      logger.info(`Started K8s health check for ${config.kind}/${config.namespace}/${config.name} with interval ${config.interval}ms`);
    }
  }

  private async runHealthCheck(config: HealthCheckConfig): Promise<void> {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(config.url, {
        timeout: 10000,
        validateStatus: () => true, // Don't throw on any status code
      });

      const responseTime = Date.now() - startTime;
      const result: HealthCheckResult = {
        name: config.name,
        url: config.url,
        status: response.status >= 200 && response.status < 300 ? 'healthy' : 'unhealthy',
        statusCode: response.status,
        responseTime,
        timestamp: Date.now(),
      };

      this.healthCheckResults.set(config.name, result);
      logger.debug(`Health check for ${config.name}: ${result.status} (${responseTime}ms)`);
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const result: HealthCheckResult = {
        name: config.name,
        url: config.url,
        status: 'unhealthy',
        responseTime,
        timestamp: Date.now(),
        error: error.message,
      };

      this.healthCheckResults.set(config.name, result);
      logger.debug(`Health check for ${config.name} failed: ${error.message}`);
    }
  }

  private async runK8sHealthCheck(config: K8sHealthCheckConfig): Promise<void> {
    if (!this.k8sController) return;

    try {
      const result = await this.k8sController.checkResourceHealth(
        config.kind,
        config.name,
        config.namespace
      );

      this.k8sHealthCheckResults.set(`${config.namespace}/${config.kind}/${config.name}`, {
        ...result,
        timestamp: Date.now(),
      });

      logger.debug(`K8s health check for ${config.kind}/${config.namespace}/${config.name}: ${result.status}`);
    } catch (error: any) {
      logger.error(`K8s health check failed for ${config.kind}/${config.namespace}/${config.name}:`, error.message);
      
      this.k8sHealthCheckResults.set(`${config.namespace}/${config.kind}/${config.name}`, {
        kind: config.kind,
        name: config.name,
        namespace: config.namespace,
        status: 'unknown',
        message: error.message,
        timestamp: Date.now(),
      });
    }
  }

  stopHealthChecks(): void {
    logger.info('Stopping all health checks...');
    
    for (const [name, timer] of this.healthCheckTimers.entries()) {
      clearInterval(timer);
      logger.info(`Stopped health check: ${name}`);
    }
    
    this.healthCheckTimers.clear();
  }

  stopK8sHealthChecks(): void {
    logger.info('Stopping K8s health checks...');
    
    for (const [name, timer] of this.healthCheckTimers.entries()) {
      if (name.startsWith('k8s-')) {
        clearInterval(timer);
        this.healthCheckTimers.delete(name);
        logger.info(`Stopped K8s health check: ${name}`);
      }
    }
  }

  getHealthCheckResults(includeHidden: boolean = false): HealthCheckResult[] {
    return Array.from(this.healthCheckResults.values());
  }

  getK8sHealthCheckResults(): any[] {
    return Array.from(this.k8sHealthCheckResults.values());
  }

  async getSystemStatus(
    unifiConnected: boolean,
    unifiDeviceCount: number,
    unifiInternet: any,
    k8sConnected: boolean,
    k8sNodeCount: number,
    k8sReadyNodes: number,
    healthCheckConfigs: HealthCheckConfig[],
    k8sHealthCheckConfigs: K8sHealthCheckConfig[]
  ): Promise<SystemStatus> {
    // Filter out hidden health checks for display
    const visibleHealthChecks = healthCheckConfigs.filter(c => !c.hidden);
    const healthChecks = Array.from(this.healthCheckResults.values())
      .filter(result => visibleHealthChecks.some(config => config.name === result.name));

    // Filter out hidden K8s health checks for display
    const visibleK8sHealthChecks = k8sHealthCheckConfigs.filter(c => !c.hidden);
    const k8sResourceHealth = Array.from(this.k8sHealthCheckResults.values())
      .filter(result => 
        visibleK8sHealthChecks.some(config => 
          config.name === result.name && 
          config.namespace === result.namespace &&
          config.kind === result.kind
        )
      );

    return {
      unifi: {
        connected: unifiConnected,
        deviceCount: unifiDeviceCount,
        internet: unifiInternet,
      },
      k8s: {
        connected: k8sConnected,
        nodeCount: k8sNodeCount,
        readyNodes: k8sReadyNodes,
        resourceHealth: k8sResourceHealth,
      },
      healthChecks,
      timestamp: Date.now(),
    };
  }
}
