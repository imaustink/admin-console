import { NodePortMapping } from '../../types';
import logger from '../../utils/logger';

export class PortMapperControllerMock {
  constructor(private unifiController: any) {
    logger.info('[MOCK] PortMapperController initialized');
  }

  async getNodePortMappings(nodes: { name: string; mac?: string }[]): Promise<NodePortMapping[]> {
    logger.info('[MOCK] Getting port mappings for all nodes...');
    await new Promise(resolve => setTimeout(resolve, 150));

    // Map of node names to port mappings
    const mappings: { [key: string]: NodePortMapping } = {
      'k8s-master-01': {
        nodeName: 'k8s-master-01',
        switchName: 'Main Switch',
        switchMac: '00:11:22:33:44:55',
        portIdx: 1,
        poeAvailable: true,
      },
      'k8s-worker-01': {
        nodeName: 'k8s-worker-01',
        switchName: 'Main Switch',
        switchMac: '00:11:22:33:44:55',
        portIdx: 2,
        poeAvailable: true,
      },
      'k8s-worker-02': {
        nodeName: 'k8s-worker-02',
        switchName: 'Main Switch',
        switchMac: '00:11:22:33:44:55',
        portIdx: 3,
        poeAvailable: true,
      },
      'k8s-worker-03': {
        nodeName: 'k8s-worker-03',
        switchName: 'Main Switch',
        switchMac: '00:11:22:33:44:55',
        portIdx: 4,
        poeAvailable: true,
      },
      'k8s-worker-04': {
        nodeName: 'k8s-worker-04',
        switchName: 'Main Switch',
        switchMac: '00:11:22:33:44:55',
        portIdx: 5,
        poeAvailable: true,
      },
    };

    return nodes.map(node => {
      return mappings[node.name] || {
        nodeName: node.name,
        switchName: 'Unknown',
        portIdx: 0,
        poeAvailable: false,
      };
    });
  }

  async powerCycleNodePort(nodeName: string, nodes: { name: string; mac?: string }[]): Promise<void> {
    logger.info(`[MOCK] Power cycling port for node ${nodeName}...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  clearCache(): void {
    logger.info('[MOCK] Clearing port mapper cache');
  }
}
