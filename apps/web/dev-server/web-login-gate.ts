import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';

import { isDocumentLoad } from './document-load.js';
import { toSafeReturnPath } from './return-path.js';
import { isSameOriginRequest } from './same-origin-request.js';
import { renderWebLoginPage } from './web-login-page.js';
import { WEB_LOGIN_PATH, WEB_LOGOUT_PATH } from './web-login-routes.js';
import type { WebLoginThrottle } from './web-login-throttle.js';
import { matchesWebPassword } from './web-password-match.js';
import {
  readWebSessionToken,
  serializeClearedWebSessionCookie,
  serializeWebSessionCookie,
  withoutWebSessionCookie,
} from './web-session-cookie.js';
import type { WebSessionStore } from './web-session-store.js';

const MAX_LOGIN_BODY_BYTES = 4096;
const UNKNOWN_ADDRESS = 'unknown';
const NO_STORE = 'no-store';
const PAGE_HEADERS = {
  'Cache-Control': NO_STORE,
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  'Content-Type': 'text/html; charset=utf-8',
  'Referrer-Policy': 'same-origin',
} as const;
const LOGIN_REQUIRED_PROBLEM = JSON.stringify({
  code: 'web_login_required',
  message: 'Сеанс закончился: обновите страницу и введите пароль.',
});

export interface WebLoginGateOptions {
  readonly password: string;
  readonly sessions: WebSessionStore;
  readonly throttle: WebLoginThrottle;
}

class LoginBodyTooLargeError extends Error {}

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function sendPage(
  response: ServerResponse,
  status: number,
  html: string,
  extraHeaders: Record<string, string> = {},
): void {
  response.writeHead(status, { ...PAGE_HEADERS, ...extraHeaders });
  response.end(html);
}

function sendEmpty(response: ServerResponse, status: number): void {
  response.writeHead(status, { 'Cache-Control': NO_STORE });
  response.end();
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_LOGIN_BODY_BYTES) {
        reject(new LoginBodyTooLargeError());
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function stripSessionCookie(request: IncomingMessage): void {
  const otherCookies = withoutWebSessionCookie(request.headers.cookie);

  if (otherCookies === undefined) delete request.headers.cookie;
  else request.headers.cookie = otherCookies;
}

function keepOutOfEveryCache(response: ServerResponse): void {
  const setHeader = response.setHeader.bind(response);

  response.setHeader = ((name: string, value: number | string | readonly string[]) =>
    setHeader(name, name.toLowerCase() === 'cache-control' ? NO_STORE : value)) as typeof response.setHeader;
  setHeader('Cache-Control', NO_STORE);
}

export class WebLoginGate {
  private readonly options: WebLoginGateOptions;

  constructor(options: WebLoginGateOptions) {
    this.options = options;
  }

  async handleRequest(request: IncomingMessage, response: ServerResponse, next: () => void): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://web.invalid');
    const method = request.method ?? 'GET';
    const token = readWebSessionToken(request.headers.cookie);
    const { sessions } = this.options;

    if (url.pathname === WEB_LOGIN_PATH && method === 'POST') {
      await this.logIn(request, response, request.socket.remoteAddress ?? UNKNOWN_ADDRESS);
      return;
    }

    if (url.pathname === WEB_LOGOUT_PATH) {
      sessions.revoke(token);
      response.writeHead(303, {
        'Cache-Control': NO_STORE,
        Location: WEB_LOGIN_PATH,
        'Set-Cookie': serializeClearedWebSessionCookie(),
      });
      response.end();
      return;
    }

    if (isDocumentLoad(method, request.headers)) {
      if (url.pathname !== WEB_LOGIN_PATH && sessions.admitDocumentLoad(token)) {
        stripSessionCookie(request);
        keepOutOfEveryCache(response);
        next();
        return;
      }

      sessions.revoke(token);
      const atLogin = url.pathname === WEB_LOGIN_PATH;
      sendPage(
        response,
        atLogin ? 200 : 401,
        renderWebLoginPage({ next: toSafeReturnPath(atLogin ? url.searchParams.get('next') : request.url) }),
        token === null ? {} : { 'Set-Cookie': serializeClearedWebSessionCookie() },
      );
      return;
    }

    if (sessions.isValid(token)) {
      stripSessionCookie(request);
      next();
      return;
    }

    if (isApiPath(url.pathname)) {
      response.writeHead(401, { 'Cache-Control': NO_STORE, 'Content-Type': 'application/json; charset=utf-8' });
      response.end(LOGIN_REQUIRED_PROBLEM);
      return;
    }

    sendEmpty(response, 401);
  }

  refuseUpgrade(request: IncomingMessage, socket: Duplex): void {
    if (this.options.sessions.isValid(readWebSessionToken(request.headers.cookie))) {
      stripSessionCookie(request);
      return;
    }

    delete request.headers['sec-websocket-protocol'];
    delete request.headers.upgrade;
    socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  }

  private async logIn(request: IncomingMessage, response: ServerResponse, address: string): Promise<void> {
    if (!isSameOriginRequest(request.headers)) {
      request.resume();
      sendEmpty(response, 403);
      return;
    }

    if (!request.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) {
      request.resume();
      sendEmpty(response, 415);
      return;
    }

    let fields: URLSearchParams;

    try {
      fields = new URLSearchParams(await readBody(request));
    } catch (error) {
      if (!(error instanceof LoginBodyTooLargeError)) throw error;
      response.writeHead(413, { Connection: 'close' });
      response.end();
      return;
    }

    this.answerLogin(response, address, fields);
  }

  private answerLogin(response: ServerResponse, address: string, fields: URLSearchParams): void {
    const { password, sessions, throttle } = this.options;
    const nextPath = toSafeReturnPath(fields.get('next'));
    const retryAfterMs = throttle.retryAfterMs(address);

    if (retryAfterMs > 0) {
      const seconds = Math.ceil(retryAfterMs / 1000);
      sendPage(
        response,
        429,
        renderWebLoginPage({
          error: `Слишком много попыток. Подождите ${seconds} с и попробуйте снова.`,
          next: nextPath,
        }),
        { 'Retry-After': String(seconds) },
      );
      return;
    }

    if (!matchesWebPassword(fields.get('password') ?? '', password)) {
      const waitSeconds = Math.ceil(throttle.recordFailure(address) / 1000);
      sendPage(
        response,
        401,
        renderWebLoginPage({ error: `Неверный пароль. Следующая попытка — через ${waitSeconds} с.`, next: nextPath }),
      );
      return;
    }

    throttle.recordSuccess(address);
    response.writeHead(303, {
      'Cache-Control': NO_STORE,
      Location: nextPath,
      'Set-Cookie': serializeWebSessionCookie(sessions.create()),
    });
    response.end();
  }
}
