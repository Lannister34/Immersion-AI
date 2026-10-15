import net from 'node:net';

import { readTcpConnectDestination, type TcpDestination } from './tcp-connect-destination.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);

export class ForeignConnectionError extends Error {
  readonly code = 'ECONNREFUSED';

  constructor(readonly destination: string) {
    super(`Refused a test connection to ${destination}: no server in this test process listens there.`);
    this.name = 'ForeignConnectionError';
  }
}

export interface ForeignConnectionGuard {
  assertNoneRefused(): void;
  uninstall(): void;
}

export function installForeignConnectionGuard(): ForeignConnectionGuard {
  const ownPorts = new Set<number>();
  const refused: string[] = [];
  const originalListen = net.Server.prototype.listen;
  const originalConnect = net.Socket.prototype.connect;

  function isOwn(destination: TcpDestination) {
    return LOOPBACK_HOSTS.has(destination.host) && ownPorts.has(destination.port);
  }

  net.Server.prototype.listen = function trackOwnPort(this: net.Server, ...args: unknown[]) {
    this.once('listening', () => {
      const address = this.address();

      if (typeof address === 'object' && address !== null) {
        ownPorts.add(address.port);
        this.once('close', () => ownPorts.delete(address.port));
      }
    });

    return Reflect.apply(originalListen, this, args);
  };

  net.Socket.prototype.connect = function refuseForeignDestination(this: net.Socket, ...args: unknown[]) {
    const destination = readTcpConnectDestination(args);

    if (destination === null || isOwn(destination)) {
      return Reflect.apply(originalConnect, this, args);
    }

    const label = `${destination.host}:${destination.port}`;
    refused.push(label);
    process.nextTick(() => this.destroy(new ForeignConnectionError(label)));

    return this;
  };

  return {
    assertNoneRefused() {
      const destinations = new Set(refused.splice(0));

      if (destinations.size > 0) {
        throw new Error(
          `This test, or work an earlier test left running, tried to connect to ${[...destinations].join(', ')}, ` +
            'where no server of this test process listens. Stub the provider or start a fake server in the test.',
        );
      }
    },
    uninstall() {
      net.Server.prototype.listen = originalListen;
      net.Socket.prototype.connect = originalConnect;
    },
  };
}
