import { readApiConfig } from '../../config/read-api-config.js';
import { type ApiLogger, createApiLogger } from './api-logger.js';
import type { LogPort } from './log-port.js';

let sharedApiLogger: ApiLogger | null = null;

// TODO: delete once every infrastructure caller receives a LogPort from the composition root (F-42)
export function getSharedApiLogger(): LogPort {
  sharedApiLogger ??= createApiLogger(readApiConfig().logLevel);

  return sharedApiLogger;
}
