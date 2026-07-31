import pino from 'pino';

export function buildApiLogger() {
  return pino({
    level: 'info',
    name: 'immersion-api',
  });
}

let sharedApiLogger: pino.Logger | null = null;

/**
 * Process-wide logger for infrastructure code that runs outside a Fastify request
 * context (file repositories, runtime process management).
 */
export function getSharedApiLogger(): pino.Logger {
  sharedApiLogger ??= buildApiLogger();

  return sharedApiLogger;
}
