import type { ApiConfig } from '../config/api-config.js';
import { type ChatCompletionClient, createChatCompletionClient } from '../modules/generation/index.js';
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
  readonly chatCompletionClient: ChatCompletionClient;
}

export type ApiDependencyOverrides = Partial<Omit<ApiDependencies, 'config'>>;

export function createApiDependencies(config: ApiConfig, overrides: ApiDependencyOverrides = {}): ApiDependencies {
  const httpFetch = overrides.httpFetch ?? globalHttpFetch;

  return {
    config,
    logger: overrides.logger ?? createApiLogger(config.logLevel),
    clock: overrides.clock ?? systemClock,
    httpFetch,
    chatCompletionClient: overrides.chatCompletionClient ?? createChatCompletionClient({ httpFetch }),
  };
}
