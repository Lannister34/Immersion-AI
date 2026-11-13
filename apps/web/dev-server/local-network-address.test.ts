import { describe, expect, it } from 'vitest';

import { isLocalNetworkAddress } from './local-network-address.js';

describe('isLocalNetworkAddress', () => {
  it('accepts loopback and the private and link-local ranges', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.254',
      '192.168.31.216',
      '169.254.10.20',
      '::1',
      'fe80::1',
      'fd12:3456::1',
    ]) {
      expect(`${address} ${isLocalNetworkAddress(address)}`).toBe(`${address} true`);
    }
  });

  it('accepts a private IPv4 caller that a dual-stack socket reports as IPv4-mapped', () => {
    expect(isLocalNetworkAddress('::ffff:192.168.1.20')).toBe(true);
    expect(isLocalNetworkAddress('::ffff:c0a8:114')).toBe(true);
  });

  it('refuses public, carrier-grade NAT and benchmark addresses, and anything that is not an address', () => {
    for (const address of [
      '8.8.8.8',
      '172.32.0.1',
      '100.64.0.1',
      '198.18.0.1',
      '::ffff:8.8.8.8',
      '2001:db8::1',
      'fe80::1%12',
      'localhost',
      '',
      undefined,
    ]) {
      expect(`${address} ${isLocalNetworkAddress(address)}`).toBe(`${address} false`);
    }
  });
});
