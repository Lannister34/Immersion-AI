import { describe, expect, it } from 'vitest';

import { readTcpConnectDestination } from './tcp-connect-destination.js';

function onConnect() {
  return undefined;
}

describe('readTcpConnectDestination', () => {
  it('reads the normalized [options, callback] array that net.connect, http and fetch hand to Socket#connect', () => {
    expect(readTcpConnectDestination([[{ host: '10.0.0.5', port: 443 }, onConnect]])).toEqual({
      host: '10.0.0.5',
      port: 443,
    });
  });

  it('reads an options object passed straight to Socket#connect', () => {
    expect(readTcpConnectDestination([{ host: 'cloud-provider.invalid', port: 443 }, onConnect])).toEqual({
      host: 'cloud-provider.invalid',
      port: 443,
    });
  });

  it('reads the positional (port, host) form', () => {
    expect(readTcpConnectDestination([6007, '192.168.1.20', onConnect])).toEqual({ host: '192.168.1.20', port: 6007 });
  });

  it('reads a digit-string port as the number Node connects to, in either form', () => {
    expect(readTcpConnectDestination(['6007', '192.168.1.20'])).toEqual({ host: '192.168.1.20', port: 6007 });
    expect(readTcpConnectDestination([{ host: '192.168.1.20', port: '6007' }])).toEqual({
      host: '192.168.1.20',
      port: 6007,
    });
  });

  it('reads a port string Number() accepts as Node does, so padding or hex cannot slip a connection past the guard', () => {
    expect(readTcpConnectDestination([' 6007 ', '192.168.1.20'])).toEqual({ host: '192.168.1.20', port: 6007 });
    expect(readTcpConnectDestination(['0x1BB', '192.168.1.20'])).toEqual({ host: '192.168.1.20', port: 443 });
  });

  it('takes localhost as the host when none or an empty one is given, as Node does', () => {
    expect(readTcpConnectDestination([6007])).toEqual({ host: 'localhost', port: 6007 });
    expect(readTcpConnectDestination([6007, onConnect])).toEqual({ host: 'localhost', port: 6007 });
    expect(readTcpConnectDestination([6007, ''])).toEqual({ host: 'localhost', port: 6007 });
    expect(readTcpConnectDestination([{ port: 6007 }])).toEqual({ host: 'localhost', port: 6007 });
    expect(readTcpConnectDestination([{ host: '', port: 6007 }])).toEqual({ host: 'localhost', port: 6007 });
    expect(readTcpConnectDestination([{ host: null, port: 6007 }])).toEqual({ host: 'localhost', port: 6007 });
    expect(readTcpConnectDestination([[{ port: 6007 }, onConnect]])).toEqual({ host: 'localhost', port: 6007 });
  });

  it('reads the edges of the TCP port range as ports, as Node does', () => {
    expect(readTcpConnectDestination([{ host: '192.168.1.20', port: 0 }])).toEqual({ host: '192.168.1.20', port: 0 });
    expect(readTcpConnectDestination(['65535', '192.168.1.20'])).toEqual({ host: '192.168.1.20', port: 65_535 });
  });

  it('reads no TCP destination from a Unix socket or Windows pipe path, which never leaves the machine', () => {
    expect(readTcpConnectDestination(['/tmp/immersion.sock'])).toBeNull();
    expect(readTcpConnectDestination(['\\\\.\\pipe\\immersion'])).toBeNull();
    expect(readTcpConnectDestination([{ path: '\\\\.\\pipe\\immersion' }])).toBeNull();
    expect(readTcpConnectDestination([[{ path: '/tmp/immersion.sock' }, onConnect]])).toBeNull();
  });

  it('reads no TCP destination from the { host, path, port } options node:http and undici send for a socketPath, since Node dials the path and ignores the port', () => {
    expect(
      readTcpConnectDestination([[{ host: 'localhost', path: '\\\\.\\pipe\\immersion', port: 80 }, onConnect]]),
    ).toBeNull();
    expect(readTcpConnectDestination([{ host: '10.0.0.5', path: '/tmp/immersion.sock', port: 443 }])).toBeNull();
  });

  it('reads an empty path as no path, as Node does, so it cannot slip a TCP connection past the guard', () => {
    expect(readTcpConnectDestination([{ host: '10.0.0.5', path: '', port: 443 }])).toEqual({
      host: '10.0.0.5',
      port: 443,
    });
  });

  it('reads no TCP destination from a port Node itself rejects before connecting', () => {
    expect(readTcpConnectDestination(['', '192.168.1.20'])).toBeNull();
    expect(readTcpConnectDestination(['6007.5', '192.168.1.20'])).toBeNull();
    expect(readTcpConnectDestination(['65536', '192.168.1.20'])).toBeNull();
    expect(readTcpConnectDestination(['Infinity', '192.168.1.20'])).toBeNull();
    expect(readTcpConnectDestination([{ host: '192.168.1.20', port: '-1' }])).toBeNull();
    expect(readTcpConnectDestination([{ host: '192.168.1.20', port: Number.NaN }])).toBeNull();
    expect(readTcpConnectDestination([{ host: '192.168.1.20', port: -1 }])).toBeNull();
    expect(readTcpConnectDestination([{ host: '192.168.1.20', port: 6007.5 }])).toBeNull();
    expect(readTcpConnectDestination([{ host: '192.168.1.20', port: 65_536 }])).toBeNull();
    expect(readTcpConnectDestination([{ host: '192.168.1.20', port: null }])).toBeNull();
    expect(readTcpConnectDestination([{ host: '192.168.1.20' }])).toBeNull();
    expect(readTcpConnectDestination([])).toBeNull();
  });

  it('reads no TCP destination from options whose host Node rejects before connecting', () => {
    expect(readTcpConnectDestination([{ host: 5, port: 6007 }])).toBeNull();
  });
});
