import { UnifiController } from './unifi';
import { NodePortMapping } from '../types';
import logger from '../utils/logger';

interface CachedData {
  timestamp: number;
  data: any;
}

export class PortMapperController {
  private unifiController: UnifiController;
  private cache: Map<string, CachedData> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute cache
  private readonly QUERY_TIMEOUT = 3000; // 3 second timeout per query

  constructor(unifiController: UnifiController) {
    this.unifiController = unifiController;
  }

  private isCacheValid(key: string): boolean {
    const cached = this.cache.get(key);
    if (!cached) return false;
    return Date.now() - cached.timestamp < this.CACHE_TTL;
  }

  private getCached<T>(key: string): T | null {
    if (this.isCacheValid(key)) {
      return this.cache.get(key)!.data as T;
    }
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      timestamp: Date.now(),
      data,
    });
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      ),
    ]);
  }

  async getNodePortMappings(nodes: { name: string; ip?: string; mac?: string }[]): Promise<NodePortMapping[]> {
    logger.info('Getting port mappings for all nodes...');
    const startTime = Date.now();

    try {
      // Check if we have cached data for all nodes
      const cacheKey = 'all-nodes-mappings';
      const cached = this.getCached<NodePortMapping[]>(cacheKey);
      if (cached) {
        logger.info(`Using cached port mappings (${Date.now() - startTime}ms)`);
        return cached;
      }

      // Fetch all necessary data in parallel with timeouts
      const [devices, clients] = await Promise.all([
        this.withTimeout(this.unifiController.getDevices(), this.QUERY_TIMEOUT)
          .catch(err => {
            logger.warn('Failed to fetch devices:', err.message);
            return [];
          }),
        this.withTimeout(this.unifiController.getAllClients(), this.QUERY_TIMEOUT)
          .catch(err => {
            logger.warn('Failed to fetch clients:', err.message);
            return [];
          }),
      ]);

      // Filter for switches only
      const switches = devices.filter(d => d.type === 'usw' || d.type === 'usg');
      
      if (switches.length === 0) {
        logger.warn('No switches found');
        return [];
      }

      // Fetch all switch port tables in parallel with timeouts
      const switchPortPromises = switches.map(async (switchDevice) => {
        try {
          const ports = await this.withTimeout(
            this.unifiController.getSwitchPorts(switchDevice.mac),
            this.QUERY_TIMEOUT
          );
          return {
            switchDevice,
            ports,
          };
        } catch (err: any) {
          logger.warn(`Failed to fetch ports for switch ${switchDevice.name}:`, err.message);
          return {
            switchDevice,
            ports: [],
          };
        }
      });

      const switchPortResults = await Promise.all(switchPortPromises);

      // Build mapping for each node
      const mappings: NodePortMapping[] = nodes.map(node => {
        const nodeMac = node.mac?.toLowerCase();
        const nodeIp = node.ip;
        
        // Find client by MAC (preferred) or IP address (fallback)
        let client = nodeMac ? clients.find(c => c.mac?.toLowerCase() === nodeMac) : null;
        
        // If not found by MAC, try matching by IP
        if (!client && nodeIp) {
          client = clients.find(c => c.ip === nodeIp);
          if (client) {
            logger.info(`Matched node ${node.name} by IP address ${nodeIp}`);
          }
        } else if (client) {
          logger.info(`Matched node ${node.name} by MAC address ${nodeMac}`);
        }
        
        if (!client || !client.sw_mac) {
          logger.warn(`Unable to find UniFi client for node ${node.name} (IP: ${nodeIp}, MAC: ${nodeMac || 'N/A'})`);
          return {
            nodeName: node.name,
            switchName: 'Not Connected',
            portIdx: 0,
            poeAvailable: false,
          };
        }

        // Find the switch this client is connected to
        const switchInfo = switchPortResults.find(
          s => s.switchDevice.mac.toLowerCase() === client.sw_mac.toLowerCase()
        );

        if (!switchInfo) {
          return {
            nodeName: node.name,
            switchName: 'Switch Not Found',
            portIdx: client.sw_port || 0,
            poeAvailable: false,
          };
        }

        // Find the port
        const port = switchInfo.ports.find(p => p.port_idx === client.sw_port);
        
        return {
          nodeName: node.name,
          switchName: switchInfo.switchDevice.name || switchInfo.switchDevice.mac,
          switchMac: switchInfo.switchDevice.mac,
          portIdx: client.sw_port || 0,
          poeAvailable: port ? (port.port_poe && port.poe_enable) : false,
        };
      });

      // Cache the results
      this.setCache(cacheKey, mappings);

      const elapsed = Date.now() - startTime;
      logger.info(`Port mappings retrieved successfully in ${elapsed}ms`);
      return mappings;

    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      logger.error(`Failed to get port mappings after ${elapsed}ms:`, error.message);
      
      // Return empty mappings for all nodes
      return nodes.map(node => ({
        nodeName: node.name,
        switchName: 'Error',
        portIdx: 0,
        poeAvailable: false,
      }));
    }
  }

  async powerCycleNodePort(nodeName: string, nodes: { name: string; ip?: string; mac?: string }[]): Promise<void> {
    logger.info(`Power cycling port for node ${nodeName}...`);

    try {
      // Get the port mapping for this specific node
      const mappings = await this.getNodePortMappings(nodes);
      const mapping = mappings.find(m => m.nodeName === nodeName);

      if (!mapping || !mapping.switchMac) {
        throw new Error('Port mapping not found for node');
      }

      if (!mapping.poeAvailable) {
        throw new Error('Node is not connected to a PoE-enabled port');
      }

      await this.unifiController.powerCyclePort(mapping.switchMac, mapping.portIdx);
      
      // Invalidate cache after power cycle
      this.cache.delete('all-nodes-mappings');
      
      logger.info(`Successfully power cycled port for node ${nodeName}`);
    } catch (error: any) {
      logger.error(`Failed to power cycle port for node ${nodeName}:`, error.message);
      throw error;
    }
  }

  clearCache(): void {
    logger.info('Clearing port mapper cache');
    this.cache.clear();
  }
}
