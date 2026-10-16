import { BlockList, isIP } from 'node:net';

const LOOPBACK_ADDRESSES = new BlockList();

LOOPBACK_ADDRESSES.addSubnet('127.0.0.0', 8, 'ipv4');
LOOPBACK_ADDRESSES.addAddress('::1', 'ipv6');

export function isLoopbackAddress(address: string): boolean {
  if (address.includes('%')) {
    return false;
  }

  switch (isIP(address)) {
    case 4:
      return LOOPBACK_ADDRESSES.check(address, 'ipv4');
    case 6:
      return LOOPBACK_ADDRESSES.check(address, 'ipv6');
    default:
      return false;
  }
}
