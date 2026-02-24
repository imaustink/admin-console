import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { UnifiDevice, InternetStats } from '../types';
import logger from '../utils/logger';

export class UnifiController {
  private client: AxiosInstance;
  private siteName: string;
  private cookie: string | null = null;
  private isUnifiOS: boolean = false; // UDM Pro, UDR, etc.

  constructor(
    private host: string,
    private port: number,
    private username: string,
    private password: string,
    site: string = 'default'
  ) {
    this.siteName = site;
    this.client = axios.create({
      baseURL: `https://${host}:${port}`,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 30000,
    });
    
    // Detect UniFi OS (UDM Pro uses port 443)
    this.isUnifiOS = port === 443;
    logger.info(`UniFi Controller mode: ${this.isUnifiOS ? 'UniFi OS (UDM/UDR)' : 'Traditional Controller'}`);
  }

  private getApiPath(path: string): string {
    // UDM Pro/UniFi OS requires /proxy/network prefix for most API calls
    if (this.isUnifiOS && path.startsWith('/api/s/')) {
      return `/proxy/network${path}`;
    }
    return path;
  }

  async login(): Promise<void> {
    try {
      logger.info('Logging in to Unifi Controller...');
      
      // UDM Pro/UniFi OS uses different endpoint
      const loginEndpoint = this.isUnifiOS ? '/api/auth/login' : '/api/login';
      logger.info(`Using login endpoint: ${loginEndpoint}`);
      
      const response = await this.client.post(loginEndpoint, {
        username: this.username,
        password: this.password,
      });

      const cookies = response.headers['set-cookie'];
      if (cookies && cookies.length > 0) {
        this.cookie = cookies.join(';');
        logger.info('Successfully logged in to Unifi Controller');
      } else {
        throw new Error('No cookies received from login');
      }
    } catch (error: any) {
      const errorMsg = error.response ? `HTTP ${error.response.status}: ${error.response.statusText}` : error.message;
      logger.error('Failed to login to Unifi Controller:', errorMsg);
      logger.error('Login URL:', `${this.client.defaults.baseURL}${this.isUnifiOS ? '/api/auth/login' : '/api/login'}`);
      throw new Error(`Unifi login failed: ${errorMsg}`);
    }
  }

  private async ensureLoggedIn(): Promise<void> {
    if (!this.cookie) {
      await this.login();
    }
  }

  async getDevices(): Promise<UnifiDevice[]> {
    await this.ensureLoggedIn();
    
    try {
      logger.info('Fetching Unifi devices...');
      
      const response = await this.client.get(this.getApiPath(`/api/s/${this.siteName}/stat/device`), {
        headers: { Cookie: this.cookie! },
      });

      const devices: UnifiDevice[] = response.data.data.map((device: any) => ({
        _id: device._id,
        name: device.name || device.hostname || 'Unknown',
        ip: device.ip,
        mac: device.mac,
        model: device.model,
        type: device.type,
        version: device.version,
        state: device.state,
        uptime: device.uptime,
      }));

      logger.info(`Found ${devices.length} Unifi devices`);
      return devices;
    } catch (error: any) {
      logger.error('Failed to get Unifi devices:', error.message);
      throw new Error(`Failed to get devices: ${error.message}`);
    }
  }

  async getInternetStats(): Promise<InternetStats> {
    await this.ensureLoggedIn();
    
    try {
      logger.info('Fetching internet statistics...');
      const [healthResponse, statsResponse] = await Promise.all([
        this.client.get(this.getApiPath(`/api/s/${this.siteName}/stat/health`), {
          headers: { Cookie: this.cookie! },
        }),
        this.client.get(this.getApiPath(`/api/s/${this.siteName}/stat/sysinfo`), {
          headers: { Cookie: this.cookie! },
        })
      ]);

      // Find WAN health data
      const wanHealth = healthResponse.data.data.find((h: any) => h.subsystem === 'wan');
      
      // Get system info for uptime
      const sysinfo = statsResponse.data.data && statsResponse.data.data.length > 0 
        ? statsResponse.data.data[0] 
        : null;

      if (!wanHealth) {
        throw new Error('WAN health data not found');
      }

      const stats: InternetStats = {
        uptime: wanHealth.uptime || 0,
        uptimePercentage: ((wanHealth.uptime || 0) / 86400) * 100, // Rough calculation
        downloadSpeed: (wanHealth['xput-down'] || 0) / 1000000, // Convert to Mbps
        uploadSpeed: (wanHealth['xput-up'] || 0) / 1000000, // Convert to Mbps
        downloadBitrate: wanHealth['tx_bytes-r'] || 0, // Current download rate in bps
        uploadBitrate: wanHealth['rx_bytes-r'] || 0, // Current upload rate in bps
        latency: wanHealth.latency || 0,
      };

      logger.info('Internet stats retrieved successfully', stats);
      return stats;
    } catch (error: any) {
      logger.error('Failed to get internet stats:', error.message);
      throw new Error(`Failed to get internet stats: ${error.message}`);
    }
  }

  async powerCycle(deviceId: string): Promise<void> {
    await this.ensureLoggedIn();
    
    try {
      logger.info(`Power cycling device ${deviceId}...`);
      await this.client.post(
        this.getApiPath(`/api/s/${this.siteName}/cmd/devmgr`),
        {
          cmd: 'power-cycle',
          mac: deviceId,
        },
        {
          headers: { Cookie: this.cookie! },
        }
      );
      logger.info(`Successfully power cycled device ${deviceId}`);
    } catch (error: any) {
      logger.error(`Failed to power cycle device ${deviceId}:`, error.message);
      throw new Error(`Failed to power cycle: ${error.message}`);
    }
  }

  async updateFirmware(deviceId: string): Promise<void> {
    await this.ensureLoggedIn();
    
    try {
      logger.info(`Updating firmware for device ${deviceId}...`);
      await this.client.post(
        this.getApiPath(`/api/s/${this.siteName}/cmd/devmgr`),
        {
          cmd: 'upgrade',
          mac: deviceId,
        },
        {
          headers: { Cookie: this.cookie! },
        }
      );
      logger.info(`Successfully initiated firmware update for device ${deviceId}`);
    } catch (error: any) {
      logger.error(`Failed to update firmware for device ${deviceId}:`, error.message);
      throw new Error(`Failed to update firmware: ${error.message}`);
    }
  }

  async getSwitchPorts(switchMac: string): Promise<any[]> {
    await this.ensureLoggedIn();
    
    try {
      logger.info(`Fetching ports for switch ${switchMac}...`);
      const response = await this.client.get(this.getApiPath(`/api/s/${this.siteName}/stat/device/${switchMac}`), {
        headers: { Cookie: this.cookie! },
      });

      const device = response.data.data[0];
      if (!device) {
        throw new Error('Switch not found');
      }

      const ports = device.port_table || [];
      logger.info(`Found ${ports.length} ports on switch ${switchMac}`);
      return ports;
    } catch (error: any) {
      logger.error(`Failed to get switch ports for ${switchMac}:`, error.message);
      throw new Error(`Failed to get switch ports: ${error.message}`);
    }
  }

  async findPortByClient(clientMac: string): Promise<{ switchName: string; portIdx: number; poeAvailable: boolean } | null> {
    await this.ensureLoggedIn();
    
    try {
      logger.info(`Finding port for client ${clientMac}...`);
      
      // Get all devices
      const devicesResponse = await this.client.get(this.getApiPath(`/api/s/${this.siteName}/stat/device`), {
        headers: { Cookie: this.cookie! },
      });

      const switches = devicesResponse.data.data.filter((device: any) => 
        device.type === 'usw' || device.type === 'usg'
      );

      for (const switchDevice of switches) {
        if (switchDevice.port_table) {
          for (const port of switchDevice.port_table) {
            // Check if this port has the client connected
            if (port.mac === clientMac || 
                (port.port_poe && port.poe_enable && port.up)) {
              
              // Get clients to verify
              const clientsResponse = await this.client.get(this.getApiPath(`/api/s/${this.siteName}/stat/sta`), {
                headers: { Cookie: this.cookie! },
              });
              
              const client = clientsResponse.data.data.find((c: any) => 
                c.mac.toLowerCase() === clientMac.toLowerCase()
              );

              if (client && client.sw_mac === switchDevice.mac && client.sw_port === port.port_idx) {
                logger.info(`Found client ${clientMac} on ${switchDevice.name} port ${port.port_idx}`);
                return {
                  switchName: switchDevice.name || switchDevice.hostname,
                  portIdx: port.port_idx,
                  poeAvailable: port.port_poe && port.poe_enable,
                };
              }
            }
          }
        }
      }

      logger.info(`Client ${clientMac} not found on any switch port`);
      return null;
    } catch (error: any) {
      logger.error(`Failed to find port for client ${clientMac}:`, error.message);
      throw new Error(`Failed to find port: ${error.message}`);
    }
  }

  async powerCyclePort(switchMac: string, portIdx: number): Promise<void> {
    await this.ensureLoggedIn();
    
    try {
      logger.info(`Power cycling port ${portIdx} on switch ${switchMac}...`);
      
      // First, disable PoE
      await this.client.put(
        this.getApiPath(`/api/s/${this.siteName}/rest/device/${switchMac}`),
        {
          port_overrides: [{
            port_idx: portIdx,
            poe_mode: 'off',
          }],
        },
        {
          headers: { Cookie: this.cookie! },
        }
      );

      // Wait 5 seconds
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Re-enable PoE
      await this.client.put(
        this.getApiPath(`/api/s/${this.siteName}/rest/device/${switchMac}`),
        {
          port_overrides: [{
            port_idx: portIdx,
            poe_mode: 'auto',
          }],
        },
        {
          headers: { Cookie: this.cookie! },
        }
      );

      logger.info(`Successfully power cycled port ${portIdx} on switch ${switchMac}`);
    } catch (error: any) {
      logger.error(`Failed to power cycle port ${portIdx} on switch ${switchMac}:`, error.message);
      throw new Error(`Failed to power cycle port: ${error.message}`);
    }
  }

  async getAllClients(): Promise<any[]> {
    await this.ensureLoggedIn();
    
    try {
      logger.info('Fetching all clients...');
      const response = await this.client.get(this.getApiPath(`/api/s/${this.siteName}/stat/sta`), {
        headers: { Cookie: this.cookie! },
      });

      const clients = response.data.data || [];
      logger.info(`Found ${clients.length} clients`);
      return clients;
    } catch (error: any) {
      logger.error('Failed to get clients:', error.message);
      throw new Error(`Failed to get clients: ${error.message}`);
    }
  }

  async logout(): Promise<void> {
    if (!this.cookie) return;

    try {
      logger.info('Logging out from Unifi Controller...');
      const logoutEndpoint = this.isUnifiOS ? '/api/auth/logout' : '/api/logout';
      await this.client.post(logoutEndpoint, {}, {
        headers: { Cookie: this.cookie },
      });
      this.cookie = null;
      logger.info('Successfully logged out from Unifi Controller');
    } catch (error: any) {
      logger.error('Failed to logout from Unifi Controller:', error.message);
    }
  }
}
