import { createServer, type IncomingHttpHeaders, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WebLoginGate } from './web-login-gate.js';
import { WebLoginThrottle } from './web-login-throttle.js';
import { WebSessionStore } from './web-session-store.js';

const PASSWORD = '4821';
const HOST = '127.0.0.1';
const APP_BODY = 'the app';
const UPGRADED = 'upgraded';
const PAGE_LOAD = { 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate' };
const API_CALL = { 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors' };
const IMAGE = { 'Sec-Fetch-Dest': 'image', 'Sec-Fetch-Mode': 'no-cors' };
const MODULE = { 'Sec-Fetch-Dest': 'script', 'Sec-Fetch-Mode': 'cors' };

interface Reply {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

interface Call {
  readonly from?: string;
  readonly method?: string;
  readonly path: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
}

describe('WebLoginGate', () => {
  let clock: number;
  let server: Server;
  let port: number;
  let forwardedCookies: (string | undefined)[];
  let upgradedCookies: (string | undefined)[];

  beforeEach(async () => {
    clock = 1_000_000;
    forwardedCookies = [];
    upgradedCookies = [];
    const now = () => clock;
    const gate = new WebLoginGate({
      password: PASSWORD,
      sessions: new WebSessionStore({ maxSessions: 4, now, ttlMs: 3_600_000 }),
      throttle: new WebLoginThrottle({
        baseDelayMs: 1000,
        forgetAfterMs: 3_600_000,
        globalFailureLimit: 1000,
        globalWindowMs: 600_000,
        maxAddresses: 16,
        maxDelayMs: 300_000,
        now,
      }),
    });

    server = createServer((incoming, outgoing) => {
      gate
        .handleRequest(incoming, outgoing, () => {
          forwardedCookies.push(incoming.headers.cookie);
          outgoing.setHeader('Cache-Control', 'no-cache');
          outgoing.end(APP_BODY);
        })
        .catch(() => outgoing.destroy());
    });
    server.on('upgrade', (incoming, socket) => {
      gate.refuseUpgrade(incoming, socket);
      upgradedCookies.push(incoming.headers.cookie);
      if (!socket.writableEnded) socket.end(`HTTP/1.1 200 OK\r\nContent-Length: ${UPGRADED.length}\r\n\r\n${UPGRADED}`);
    });
    await new Promise<void>((resolve) => server.listen(0, HOST, resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function send({ body, from = HOST, headers = {}, method = 'GET', path }: Call): Promise<Reply> {
    return new Promise((resolve, reject) => {
      const outgoing = request(
        { agent: false, headers, host: HOST, localAddress: from, method, path, port },
        (incoming) => {
          const chunks: Buffer[] = [];
          incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
          incoming.on('end', () =>
            resolve({
              body: Buffer.concat(chunks).toString(),
              headers: incoming.headers,
              status: incoming.statusCode ?? 0,
            }),
          );
        },
      );
      outgoing.on('error', reject);
      outgoing.end(body);
    });
  }

  function logIn(password: string, from = HOST, next = '/chat'): Promise<Reply> {
    return send({
      body: new URLSearchParams({ next, password }).toString(),
      from,
      headers: { ...PAGE_LOAD, 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      path: '/__web/login',
    });
  }

  function sessionCookieOf(reply: Reply): string {
    const [cookie] = reply.headers['set-cookie'] ?? [];
    if (!cookie) throw new Error('No session cookie was set');
    return cookie.split(';')[0] ?? '';
  }

  async function loggedInPage(path = '/chat'): Promise<string> {
    const cookie = sessionCookieOf(await logIn(PASSWORD));
    const page = await send({ headers: { ...PAGE_LOAD, Cookie: cookie }, path });

    expect(page.body).toBe(APP_BODY);
    return cookie;
  }

  it('asks this computer for the password too: the page, sources, /@fs and the editor get the login page', async () => {
    for (const path of [
      '/',
      '/chat/abc',
      '/@fs/D:/data/user-settings.json',
      '/src/main.tsx',
      '/__open-in-editor?file=x',
    ]) {
      const reply = await send({ headers: PAGE_LOAD, path });

      expect(`${path} ${reply.status}`).toBe(`${path} 401`);
      expect(reply.body).toContain('Вход в Immersion AI');
      expect(reply.body).not.toContain(APP_BODY);
    }
  });

  it('answers sub-resources without a session with 401: API paths, avatars included, with a problem body, modules empty', async () => {
    const api = await send({ headers: API_CALL, path: '/api/providers/settings' });
    const image = await send({ headers: IMAGE, path: '/api/characters/x/avatar' });
    const module = await send({ headers: MODULE, path: '/@fs/D:/x.ts' });

    expect([api.status, image.status, module.status]).toEqual([401, 401, 401]);
    expect(JSON.parse(api.body)).toMatchObject({ code: 'web_login_required' });
    expect(JSON.parse(image.body)).toMatchObject({ code: 'web_login_required' });
    expect(module.body).toBe('');
  });

  it('treats a request without Fetch Metadata that accepts HTML as a page load', async () => {
    const reply = await send({ headers: { Accept: 'text/html,application/xhtml+xml' }, path: '/' });

    expect(reply.body).toContain('Вход в Immersion AI');
  });

  it('refuses a websocket upgrade, such as Vite HMR, without a session', async () => {
    const reply = await send({ headers: { Connection: 'Upgrade', Upgrade: 'websocket' }, path: '/' });

    expect(reply.status).toBe(401);
  });

  it('lets the right password in for one page load, then serves its modules, images, API calls and websocket', async () => {
    const login = await logIn(PASSWORD);

    expect(login.status).toBe(303);
    expect(login.headers.location).toBe('/chat');
    expect(login.headers['set-cookie']?.[0]).toMatch(
      /^immersion_web_session=[\w-]{43}; Path=\/; HttpOnly; SameSite=Strict$/u,
    );

    const cookie = sessionCookieOf(login);
    const page = await send({ headers: { ...PAGE_LOAD, Cookie: `theme=dark; ${cookie}` }, path: '/chat' });
    const module = await send({ headers: { ...MODULE, Cookie: cookie }, path: '/src/main.tsx' });
    const image = await send({ headers: { ...IMAGE, Cookie: cookie }, path: '/api/characters/x/avatar' });
    const api = await send({ headers: { ...API_CALL, Cookie: cookie }, path: '/api/chats' });
    const upgrade = await send({ headers: { Connection: 'Upgrade', Cookie: cookie, Upgrade: 'websocket' }, path: '/' });

    expect([page.body, module.body, image.body, api.body, upgrade.body]).toEqual([
      APP_BODY,
      APP_BODY,
      APP_BODY,
      APP_BODY,
      UPGRADED,
    ]);
    expect(forwardedCookies).toEqual(['theme=dark', undefined, undefined, undefined]);
    expect(upgradedCookies).toEqual([undefined]);
  });

  it('asks again at the next page load, a reload or a new tab, and ends the session for every tab', async () => {
    const cookie = await loggedInPage();
    const reload = await send({ headers: { ...PAGE_LOAD, Cookie: cookie }, path: '/chat' });

    expect(reload.status).toBe(401);
    expect(reload.body).toContain('Вход в Immersion AI');
    expect(reload.headers['set-cookie']?.[0]).toContain('Max-Age=0');
    expect((await send({ headers: { ...API_CALL, Cookie: cookie }, path: '/api/chats' })).status).toBe(401);
  });

  it('ends a session on opening the login page and at logout', async () => {
    const first = await loggedInPage();
    await send({ headers: { ...PAGE_LOAD, Cookie: first }, path: '/__web/login' });
    expect((await send({ headers: { ...API_CALL, Cookie: first }, path: '/api/chats' })).status).toBe(401);

    const second = await loggedInPage();
    const logout = await send({ headers: { ...PAGE_LOAD, Cookie: second }, path: '/__web/logout' });
    expect(logout.status).toBe(303);
    expect(logout.headers.location).toBe('/__web/login');
    expect(logout.headers['set-cookie']?.[0]).toContain('Max-Age=0');
    expect((await send({ headers: { ...API_CALL, Cookie: second }, path: '/api/chats' })).status).toBe(401);
  });

  it('ends a session when it expires', async () => {
    const cookie = await loggedInPage();
    clock += 3_600_000;

    expect((await send({ headers: { ...API_CALL, Cookie: cookie }, path: '/api/chats' })).status).toBe(401);
  });

  it('refuses a wrong password and then holds the address off for a growing delay', async () => {
    const first = await logIn('0000');
    expect(first.status).toBe(401);
    expect(first.body).toContain('Неверный пароль');

    const tooSoon = await logIn(PASSWORD);
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.headers['retry-after']).toBe('1');
    expect(tooSoon.headers['set-cookie']).toBeUndefined();

    clock += 1000;
    expect((await logIn('1111')).status).toBe(401);
    clock += 1000;
    expect((await logIn(PASSWORD)).headers['retry-after']).toBe('1');
    clock += 1000;
    expect((await logIn(PASSWORD)).status).toBe(303);
  });

  it('checks parallel guesses one at a time, so only the first is compared and the rest wait', async () => {
    const replies = await Promise.all(['0001', '0002', '0003', '0004', PASSWORD].map((guess) => logIn(guess)));

    expect(replies.map((reply) => reply.status).sort()).toEqual([401, 429, 429, 429, 429]);
    expect(replies.some((reply) => reply.headers['set-cookie'] !== undefined)).toBe(false);
  });

  it('serves the login page with a referrer policy under which browsers send its real origin when it posts', async () => {
    const page = await send({ headers: PAGE_LOAD, path: '/__web/login' });

    expect(page.headers['referrer-policy']).toBe('same-origin');
  });

  it('accepts the login form a browser posts from the page itself, Origin included', async () => {
    const reply = await send({
      body: new URLSearchParams({ next: '/chat', password: PASSWORD }).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Host: `${HOST}:${port}`,
        Origin: `http://${HOST}:${port}`,
      },
      method: 'POST',
      path: '/__web/login',
    });

    expect(reply.status).toBe(303);
  });

  it('refuses a login posted by another page', async () => {
    const reply = await send({
      body: new URLSearchParams({ password: PASSWORD }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example' },
      method: 'POST',
      path: '/__web/login',
    });

    expect(reply.status).toBe(403);
    expect(reply.headers['set-cookie']).toBeUndefined();
  });

  it('keeps the admitted page out of every cache, so Back or a restored tab must load it again', async () => {
    const cookie = sessionCookieOf(await logIn(PASSWORD));
    const page = await send({ headers: { ...PAGE_LOAD, Cookie: cookie }, path: '/chat' });

    expect(page.headers['cache-control']).toBe('no-store');
  });

  it('redirects only to a path on this server after login', async () => {
    for (const next of [
      'https://evil.example/',
      '//evil.example/',
      '/\\evil.example',
      '/\t/evil.example/',
      'chat',
      '/__web/logout',
    ]) {
      expect(`${next} ${(await logIn(PASSWORD, HOST, next)).headers.location}`).toBe(`${next} /`);
    }
  });

  it('refuses a login body that is not a form or is too large, without counting it as a failure', async () => {
    const json = await send({
      body: JSON.stringify({ password: PASSWORD }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      path: '/__web/login',
    });
    const large = await logIn('x'.repeat(5000)).catch((error: Error) => error);

    expect(json.status).toBe(415);
    expect(large instanceof Error || large.status === 413).toBe(true);
    expect((await logIn(PASSWORD)).status).toBe(303);
  });
});
