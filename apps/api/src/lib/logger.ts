import pino from 'pino';

export function buildApiLogger() {
  return pino({
    level: 'info',
    name: 'immersion-api',
  });
}

let sharedApiLogger: pino.Logger | null = null;

export function getSharedApiLogger(): pino.Logger {
  sharedApiLogger ??= buildApiLogger();

  return sharedApiLogger;
}
