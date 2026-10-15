import pino from 'pino';

import type { ApiLogLevel } from '../config/api-config.js';
import { readApiConfig } from '../config/read-api-config.js';

export function buildApiLogger(level: ApiLogLevel) {
  return pino({
    level,
    name: 'immersion-api',
  });
}

let sharedApiLogger: pino.Logger | null = null;

export function getSharedApiLogger(): pino.Logger {
  sharedApiLogger ??= buildApiLogger(readApiConfig().logLevel);

  return sharedApiLogger;
}
