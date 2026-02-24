import { UnifiDevice, InternetStats } from '../../types';
import logger from '../../utils/logger';

export class UnifiControllerMock {
  constructor(
    private host: string,
    private port: number,
    private username: string,
    private password: string,
    private site: string = 'default'
  ) {
    logger.info('[MOCK] UnifiController initialized');
  }

  async login(): Promise<void> {
    logger.info('[MOCK] Logging in to Unifi Controller...');
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async getDevices(): Promise<UnifiDevice[]> {
    logger.info('[MOCK] Fetching Unifi devices...');
    await new Promise(resolve => setTimeout(resolve, 200));

    return [
      {
        _id: '1',
        name: 'Main Switch',
        ip: '192.168.1.10',
        mac: '00:11:22:33:44:55',
        model: 'US-24-250W',
        type: 'usw',
        version: '6.5.55',
        state: 1,
        uptime: 2592000,
      },
      {
        _id: '2',
        name: 'Access Point - Living Room',
        ip: '192.168.1.20',
        mac: '00:11:22:33:44:66',
        model: 'U6-LR',
        type: 'uap',
        version: '6.5.55',
        state: 1,
        uptime: 1728000,
      },
      {
        _id: '3',
        name: 'Access Point - Bedroom',
        ip: '192.168.1.21',
        mac: '00:11:22:33:44:77',
        model: 'U6-Pro',
        type: 'uap',
        version: '6.5.55',
        state: 1,
        uptime: 1728000,
      },
      {
        _id: '4',
        name: 'Gateway',
        ip: '192.168.1.1',
        mac: '00:11:22:33:44:88',
        model: 'UDM-Pro',
        type: 'udm',
        version: '3.0.20',
        state: 1,
        uptime: 7776000,
      },
    ];
  }

  async getInternetStats(): Promise<InternetStats> {
    logger.info('[MOCK] Fetching internet statistics...');
    await new Promise(resolve => setTimeout(resolve, 150));

    // Simulate realistic internet stats
    return {
      uptime: 7776000, // ~90 days
      uptimePercentage: 99.95,
      downloadSpeed: 942.5, // Mbps
      uploadSpeed: 35.2, // Mbps
      downloadBitrate: 125000000, // ~125 Mbps current
      uploadBitrate: 15000000, // ~15 Mbps current
      latency: 12, // ms
    };
  }

  async powerCycle(deviceId: string): Promise<void> {
    logger.info(`[MOCK] Power cycling device ${deviceId}...`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  async updateFirmware(deviceId: string): Promise<void> {
    logger.info(`[MOCK] Updating firmware for device ${deviceId}...`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  async getSwitchPorts(switchMac: string): Promise<any[]> {
    logger.info(`[MOCK] Fetching ports for switch ${switchMac}...`);
    await new Promise(resolve => setTimeout(resolve, 100));

    // Return mock port table for the main switch
    if (switchMac === '00:11:22:33:44:55') {
      return [
        {
          port_idx: 1,
          name: 'k8s-master-01',
          up: true,
          port_poe: true,
          poe_enable: true,
          poe_mode: 'auto',
          poe_power: '15.4',
        },
        {
          port_idx: 2,
          name: 'k8s-worker-01',
          up: true,
          port_poe: true,
          poe_enable: true,
          poe_mode: 'auto',
          poe_power: '12.8',
        },
        {
          port_idx: 3,
          name: 'k8s-worker-02',
          up: true,
          port_poe: true,
          poe_enable: true,
          poe_mode: 'auto',
          poe_power: '11.2',
        },
        {
          port_idx: 4,
          name: 'k8s-worker-03',
          up: true,
          port_poe: true,
          poe_enable: true,
          poe_mode: 'auto',
          poe_power: '10.9',
        },
        {
          port_idx: 5,
          name: 'k8s-worker-04',
          up: true,
          port_poe: true,
          poe_enable: true,
          poe_mode: 'auto',
          poe_power: '13.1',
        },
      ];
    }

    return [];
  }

  async findPortByClient(clientMac: string): Promise<{ switchName: string; portIdx: number; poeAvailable: boolean } | null> {
    logger.info(`[MOCK] Finding port for client ${clientMac}...`);
    await new Promise(resolve => setTimeout(resolve, 100));

    // Map of MAC addresses to ports
    const macToPort: { [key: string]: { portIdx: number; poeAvailable: boolean } } = {
      'aa:bb:cc:dd:ee:01': { portIdx: 1, poeAvailable: true },
      'aa:bb:cc:dd:ee:02': { portIdx: 2, poeAvailable: true },
      'aa:bb:cc:dd:ee:03': { portIdx: 3, poeAvailable: true },
      'aa:bb:cc:dd:ee:04': { portIdx: 4, poeAvailable: true },
      'aa:bb:cc:dd:ee:05': { portIdx: 5, poeAvailable: true },
    };

    const mapping = macToPort[clientMac.toLowerCase()];
    if (mapping) {
      return {
        switchName: 'Main Switch',
        ...mapping,
      };
    }

    return null;
  }

  async powerCyclePort(switchMac: string, portIdx: number): Promise<void> {
    logger.info(`[MOCK] Power cycling port ${portIdx} on switch ${switchMac}...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  async getAllClients(): Promise<any[]> {
    logger.info('[MOCK] Fetching all clients...');
    await new Promise(resolve => setTimeout(resolve, 100));

    return [
      {
        mac: 'aa:bb:cc:dd:ee:01',
        name: 'k8s-master-01',
        ip: '192.168.1.101',
        sw_mac: '00:11:22:33:44:55',
        sw_port: 1,
      },
      {
        mac: 'aa:bb:cc:dd:ee:02',
        name: 'k8s-worker-01',
        ip: '192.168.1.111',
        sw_mac: '00:11:22:33:44:55',
        sw_port: 2,
      },
      {
        mac: 'aa:bb:cc:dd:ee:03',
        name: 'k8s-worker-02',
        ip: '192.168.1.112',
        sw_mac: '00:11:22:33:44:55',
        sw_port: 3,
      },
      {
        mac: 'aa:bb:cc:dd:ee:04',
        name: 'k8s-worker-03',
        ip: '192.168.1.113',
        sw_mac: '00:11:22:33:44:55',
        sw_port: 4,
      },
      {
        mac: 'aa:bb:cc:dd:ee:05',
        name: 'k8s-worker-04',
        ip: '192.168.1.114',
        sw_mac: '00:11:22:33:44:55',
        sw_port: 5,
      },
    ];
  }

  async logout(): Promise<void> {
    logger.info('[MOCK] Logging out from Unifi Controller...');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
