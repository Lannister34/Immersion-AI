import type { IncomingHttpHeaders } from 'node:http';

export function isSameOriginRequest(headers: IncomingHttpHeaders): boolean {
  const site = headers['sec-fetch-site'];

  if (typeof site === 'string' && site !== 'same-origin') return false;

  const { host, origin } = headers;

  if (typeof origin !== 'string') return true;
  if (typeof host !== 'string') return false;

  return origin === `http://${host}` || origin === `https://${host}`;
}
