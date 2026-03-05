import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { UnifiDevice, InternetStats } from '../types';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class UnifiController {
  private client: AxiosInstance;
  private siteName: string;
  private cookie: string | null = null;
  private isUnifiOS: boolean = false; // UDM Pro, UDR, etc.
  private cacheDir: string;
  private cacheFile: string;

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
    
    // Setup cache directory and file
    this.cacheDir = path.join(process.cwd(), 'cache');
    const cacheKey = crypto.createHash('md5').update(`${host}:${port}:${username}`).digest('hex');
    this.cacheFile = path.join(this.cacheDir, `unifi-${cacheKey}.json`);
    
    // Load cached cookie if available
    this.loadCachedCookie();
  }

  private getApiPath(path: string): string {
    // UDM Pro/UniFi OS requires /proxy/network prefix for most API calls
    if (this.isUnifiOS && path.startsWith('/api/s/')) {
      return `/proxy/network${path}`;
    }
    return path;
  }

  private loadCachedCookie(): void {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const cacheData = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));
        const now = Date.now();
        
        // Check if cache is still valid (within 24 hours)
        if (cacheData.cookie && cacheData.timestamp && (now - cacheData.timestamp < 24 * 60 * 60 * 1000)) {
          this.cookie = cacheData.cookie;
          logger.info('Loaded cached UniFi cookie');
        } else {
          logger.info('Cached UniFi cookie expired');
          this.clearCache();
        }
      }
    } catch (error: any) {
      logger.warn('Failed to load cached UniFi cookie:', error.message);
      this.clearCache();
    }
  }

  private saveCachedCookie(): void {
    try {
      // Ensure cache directory exists
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
      
      const cacheData = {
        cookie: this.cookie,
        timestamp: Date.now(),
        host: this.host,
        port: this.port,
        username: this.username,
      };
      
      fs.writeFileSync(this.cacheFile, JSON.stringify(cacheData, null, 2));
      logger.info('Cached UniFi cookie saved');
    } catch (error: any) {
      logger.warn('Failed to save UniFi cookie cache:', error.message);
    }
  }

  private clearCache(): void {
    try {
      if (fs.existsSync(this.cacheFile)) {
        fs.unlinkSync(this.cacheFile);
        logger.info('Cleared UniFi cookie cache');
      }
    } catch (error: any) {
      logger.warn('Failed to clear UniFi cookie cache:', error.message);
    }
  }

  private async validateCachedCookie(): Promise<boolean> {
    if (!this.cookie) return false;
    
    try {
      // Try a simple API call to validate the cookie
      await this.client.get(this.getApiPath(`/api/s/${this.siteName}/self`), {
        headers: { Cookie: this.cookie },
      });
      logger.info('Cached UniFi cookie is still valid');
      return true;
    } catch (error: any) {
      logger.info('Cached UniFi cookie is invalid, will re-authenticate');
      this.cookie = null;
      this.clearCache();
      return false;
    }
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
        this.saveCachedCookie();
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
    } else {
      // Validate cached cookie before using it
      const isValid = await this.validateCachedCookie();
      if (!isValid) {
        await this.login();
      }
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
        upgradable: device.upgradable || false,
        upgradeToFirmware: device.upgrade_to_firmware,
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

      // Check uptime_stats structure
      const uptimeStats = wanHealth.uptime_stats || wanHealth.uptime;

      // Note: rx_bytes-r is receive (download), tx_bytes-r is transmit (upload) - in BYTES per second
      const downloadBytesPerSec = wanHealth['rx_bytes-r'] || 0;
      const uploadBytesPerSec = wanHealth['tx_bytes-r'] || 0;
      
      // Convert bytes/sec to bits/sec
      const downloadBitrate = downloadBytesPerSec * 8;
      const uploadBitrate = uploadBytesPerSec * 8;
      
      // Get uptime - try different sources
      let uptime = 0;
      let availability = 0;
      if (typeof uptimeStats === 'object' && uptimeStats !== null) {
        // uptime_stats is an object with WAN/WAN2 keys
        // Try to get the WAN uptime value
        if (uptimeStats.WAN && uptimeStats.WAN.uptime) {
          uptime = uptimeStats.WAN.uptime;
          availability = uptimeStats.WAN.availability || 0;
        } else {
          uptime = uptimeStats.uptime || 0;
        }
      } else if (typeof uptimeStats === 'number') {
        uptime = uptimeStats;
      } else if (sysinfo && sysinfo.uptime) {
        uptime = sysinfo.uptime;
      }

      const stats: InternetStats = {
        uptime: uptime,
        uptimePercentage: availability,
        // Download/Upload Speed: Use current bitrate as a proxy since xput fields don't exist
        // Convert from bits per second to Mbps
        downloadSpeed: downloadBitrate / 1000000,
        uploadSpeed: uploadBitrate / 1000000,
        downloadBitrate: downloadBitrate, // Current download rate in bps
        uploadBitrate: uploadBitrate, // Current upload rate in bps
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
      this.clearCache();
      logger.info('Successfully logged out from Unifi Controller');
    } catch (error: any) {
      logger.error('Failed to logout from Unifi Controller:', error.message);
    }
  }
}
