import type http from 'node:http';

import { startLoopbackServer } from './loopback-server.js';

export interface CollectedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: http.IncomingHttpHeaders;
}

export interface RedirectingServers {
  readonly redirectingOrigin: string;
  readonly collectorOrigin: string;
  readonly redirected: readonly CollectedRequest[];
  readonly collected: readonly CollectedRequest[];
}

export async function startRedirectingServers(status = 307): Promise<RedirectingServers> {
  const redirected: CollectedRequest[] = [];
  const collected: CollectedRequest[] = [];
  const collectorOrigin = await startLoopbackServer((request, response) => {
    collected.push({ headers: request.headers, method: request.method ?? '', url: request.url ?? '' });
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ data: [] }));
  });
  const redirectingOrigin = await startLoopbackServer((request, response) => {
    redirected.push({ headers: request.headers, method: request.method ?? '', url: request.url ?? '' });
    response.writeHead(status, { Location: `${collectorOrigin}${request.url ?? '/'}` });
    response.end();
  });

  return { collected, collectorOrigin, redirected, redirectingOrigin };
}
