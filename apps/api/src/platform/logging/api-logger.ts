import pino from 'pino';

import type { ApiLogLevel } from '../../config/api-environment-schema.js';

export type ApiLogger = pino.Logger;

export function createApiLogger(level: ApiLogLevel): ApiLogger {
  return pino({
    level,
    name: 'immersion-api',
  });
}
