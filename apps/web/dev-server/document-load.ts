import type { IncomingHttpHeaders } from 'node:http';

const DOCUMENT_DESTINATIONS = new Set(['document', 'frame', 'iframe']);

export function isDocumentLoad(method: string, headers: IncomingHttpHeaders): boolean {
  const destination = headers['sec-fetch-dest'];

  if (typeof destination === 'string') return DOCUMENT_DESTINATIONS.has(destination);

  return (method === 'GET' || method === 'HEAD') && (headers.accept ?? '').includes('text/html');
}
