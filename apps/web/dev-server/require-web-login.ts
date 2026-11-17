import type { Connect, HttpServer, Plugin } from 'vite';

import { WebLoginGate } from './web-login-gate.js';
import { WebLoginThrottle } from './web-login-throttle.js';
import { WebSessionStore } from './web-session-store.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_SESSIONS = 32;
const THROTTLE = {
  baseDelayMs: 1000,
  forgetAfterMs: 60 * 60 * 1000,
  globalFailureLimit: 30,
  globalWindowMs: 10 * 60 * 1000,
  maxAddresses: 256,
  maxDelayMs: 5 * 60 * 1000,
};

export interface RequireWebLoginOptions {
  readonly password: string | null;
  readonly now?: () => number;
}

function install(
  middlewares: Connect.Server,
  httpServer: HttpServer | null,
  { now = Date.now, password }: RequireWebLoginOptions,
): void {
  if (password === null) return;

  const gate = new WebLoginGate({
    password,
    sessions: new WebSessionStore({ maxSessions: MAX_SESSIONS, now, ttlMs: SESSION_TTL_MS }),
    throttle: new WebLoginThrottle({ ...THROTTLE, now }),
  });

  middlewares.use((request, response, next) => {
    gate.handleRequest(request, response, next).catch((error: unknown) => next(error));
  });
  httpServer?.prependListener('upgrade', (request, socket) => gate.refuseUpgrade(request, socket));
}

export function requireWebLogin(options: RequireWebLoginOptions): Plugin {
  return {
    name: 'immersion:require-web-login',
    enforce: 'pre',
    configureServer(server) {
      install(server.middlewares, server.httpServer, options);
    },
    configurePreviewServer(server) {
      install(server.middlewares, server.httpServer, options);
    },
  };
}
