import { once } from 'node:events';
import http from 'node:http';

import { onTestFinished } from 'vitest';

async function closeServer(server: http.Server): Promise<void> {
  server.closeAllConnections();
  server.close();
  await once(server, 'close');
}

export async function startLoopbackServer(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  onTestFinished(() => closeServer(server));
  const address = server.address();

  if (typeof address !== 'object' || address === null) {
    throw new Error('The test server has no TCP address.');
  }

  return `http://127.0.0.1:${address.port}`;
}
