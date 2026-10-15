import type { ApiLogger } from './api-logger.js';

export type LogPort = Pick<ApiLogger, 'info' | 'warn' | 'error'>;
