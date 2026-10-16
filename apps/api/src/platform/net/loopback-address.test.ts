import { isIP } from 'node:net';

import { describe, expect, it } from 'vitest';

import { isLoopbackAddress } from './loopback-address.js';

describe('isLoopbackAddress', () => {
  it.each([
    '127.0.0.1',
    '127.0.0.2',
    '127.255.255.255',
    '::1',
    '0:0:0:0:0:0:0:1',
    '::ffff:127.0.0.1',
    '::FFFF:127.10.20.30',
  ])('accepts %s: every 127.0.0.0/8 address, ::1 and IPv4-mapped loopback', (address) => {
    expect(isLoopbackAddress(address)).toBe(true);
  });

  it('matches the hexadecimal IPv4-mapped form as node:net BlockList does, so no prefix stripping is needed', () => {
    expect(isLoopbackAddress('::ffff:7f00:1')).toBe(true);
    expect(isLoopbackAddress('::ffff:c0a8:105')).toBe(false);
  });

  it.each([
    '0.0.0.0',
    '::',
    '192.168.1.5',
    '10.0.0.1',
    '128.0.0.1',
    '126.255.255.255',
    '::2',
    '::ffff:10.0.0.1',
    '::ffff:0.0.0.0',
    'fe80::1%eth0',
  ])('refuses %s: LAN, wildcard and mapped non-loopback addresses', (address) => {
    expect(isLoopbackAddress(address)).toBe(false);
  });

  it.each([
    '::1%lo',
    '::1%1',
  ])('refuses %s, although node:net isIP accepts a zone-scoped IPv6 literal and BlockList matches it as ::1', (address) => {
    expect(isIP(address)).toBe(6);
    expect(isLoopbackAddress(address)).toBe(false);
  });

  it.each([
    'localhost',
    '127.1',
    '',
    ' 127.0.0.1',
    'garbage',
    '[::1]',
    '127.0.0.1:4787',
    '１２７.０.０.１',
  ])('refuses %j, which is not an IP literal', (address) => {
    expect(isLoopbackAddress(address)).toBe(false);
  });
});
