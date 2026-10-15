import type { ApiConfig } from '../config/api-config.js';
import type { Clock } from '../platform/clock/clock.js';
import { systemClock } from '../platform/clock/system-clock.js';
import { type ApiLogger, createApiLogger } from '../platform/logging/api-logger.js';
import { globalHttpFetch } from '../platform/outbound-http/global-http-fetch.js';
import type { HttpFetch } from '../platform/outbound-http/http-fetch.js';

export interface ApiDependencies {
  readonly config: ApiConfig;
  readonly logger: ApiLogger;
  readonly clock: Clock;
  readonly httpFetch: HttpFetch;
}

export type ApiDependencyOverrides = Partial<Omit<ApiDependencies, 'config'>>;

export function createApiDependencies(config: ApiConfig, overrides: ApiDependencyOverrides = {}): ApiDependencies {
  return {
    config,
    logger: overrides.logger ?? createApiLogger(config.logLevel),
    clock: overrides.clock ?? systemClock,
    httpFetch: overrides.httpFetch ?? globalHttpFetch,
  };
}
