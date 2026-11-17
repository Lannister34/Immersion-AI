import { BlockList, isIP } from 'node:net';

const localNetworks = new BlockList();

localNetworks.addSubnet('127.0.0.0', 8, 'ipv4');
localNetworks.addSubnet('10.0.0.0', 8, 'ipv4');
localNetworks.addSubnet('172.16.0.0', 12, 'ipv4');
localNetworks.addSubnet('192.168.0.0', 16, 'ipv4');
localNetworks.addSubnet('169.254.0.0', 16, 'ipv4');
localNetworks.addAddress('::1', 'ipv6');
localNetworks.addSubnet('fe80::', 10, 'ipv6');
localNetworks.addSubnet('fc00::', 7, 'ipv6');

export function isLocalNetworkAddress(address: string | undefined): boolean {
  if (address === undefined || address.includes('%')) return false;

  const family = isIP(address);

  if (family === 4) return localNetworks.check(address, 'ipv4');
  if (family === 6) return localNetworks.check(address, 'ipv6');
  return false;
}
