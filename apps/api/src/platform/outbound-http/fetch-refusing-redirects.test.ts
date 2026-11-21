import { describe, expect, it } from 'vitest';

import { startLoopbackServer } from '../../test-support/loopback-server.js';
import { startRedirectingServers } from '../../test-support/redirecting-servers.js';
import { fetchRefusingRedirects, RedirectRefusedError } from './fetch-refusing-redirects.js';
import { globalHttpFetch } from './global-http-fetch.js';

const KEY_HEADERS = { Authorization: 'Bearer sk-canary-bearer', 'x-api-key': 'sk-canary-x-api-key' };

describe('built-in fetch following a cross-origin redirect', () => {
  it('drops Authorization but forwards x-api-key to the second origin, so a followed redirect leaks Anthropic keys', async () => {
    const servers = await startRedirectingServers();

    const response = await globalHttpFetch(`${servers.redirectingOrigin}/v1/models`, { headers: KEY_HEADERS });

    expect(response.status).toBe(200);
    expect(servers.collected.map((request) => [request.headers.authorization, request.headers['x-api-key']])).toEqual([
      [undefined, 'sk-canary-x-api-key'],
    ]);
  });
});

describe('fetchRefusingRedirects', () => {
  it.each([
    301, 302, 303, 307, 308,
  ])('refuses an HTTP %i to another origin, which never sees the request', async (status) => {
    const servers = await startRedirectingServers(status);

    const failure = await fetchRefusingRedirects(globalHttpFetch, `${servers.redirectingOrigin}/v1/messages`, {
      body: JSON.stringify({ prompt: 'Привет' }),
      headers: KEY_HEADERS,
      method: 'POST',
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RedirectRefusedError);
    expect(failure).toMatchObject({
      message: expect.stringContaining(`HTTP ${status} на ${servers.collectorOrigin}/v1/messages`),
      status,
      target: `${servers.collectorOrigin}/v1/messages`,
    });
    expect(servers.collected).toEqual([]);
  });

  it('resolves a relative Location against the request url and survives one that is not a url', async () => {
    const locations = ['/v1/elsewhere', 'http://[not-a-host'];
    const origin = await startLoopbackServer((_request, response) => {
      response.writeHead(302, { Location: locations.shift() ?? '' });
      response.end();
    });

    const relative = await fetchRefusingRedirects(globalHttpFetch, `${origin}/v1/models`, {}).catch((e: unknown) => e);
    const broken = await fetchRefusingRedirects(globalHttpFetch, `${origin}/v1/models`, {}).catch((e: unknown) => e);

    expect(relative).toMatchObject({ status: 302, target: `${origin}/v1/elsewhere` });
    expect(broken).toMatchObject({ status: 302, target: null });
  });

  it('hands back any other response untouched, an error status included', async () => {
    const origin = await startLoopbackServer((_request, response) => {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Нет такой модели');
    });

    const response = await fetchRefusingRedirects(globalHttpFetch, `${origin}/v1/models`, {});

    expect([response.status, await response.text()]).toEqual([404, 'Нет такой модели']);
  });
});
