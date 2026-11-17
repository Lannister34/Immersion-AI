import type { Socket } from 'node:net';
import type { HttpServer, Plugin } from 'vite';

import { isLocalNetworkAddress } from './local-network-address.js';

function dropForeignConnections(httpServer: HttpServer | null): void {
  httpServer?.on('connection', (socket: Socket) => {
    if (!isLocalNetworkAddress(socket.remoteAddress)) {
      socket.destroy();
    }
  });
}

export function refuseForeignNetworkCallers(): Plugin {
  return {
    name: 'immersion:refuse-foreign-network-callers',
    configureServer(server) {
      dropForeignConnections(server.httpServer);
    },
    configurePreviewServer(server) {
      dropForeignConnections(server.httpServer);
    },
  };
}
