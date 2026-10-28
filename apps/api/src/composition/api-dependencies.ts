import type { ApiConfig } from '../config/api-config.js';
import { type ChatRepository, FileChatRepository } from '../modules/chats/index.js';
import {
  type ChatCompletionClient,
  createChatCompletionClient,
  type GenerationJobRegistry,
  InMemoryGenerationJobRegistry,
  ProviderTokenCounter,
} from '../modules/generation/index.js';
import type { TokenCounter } from '../modules/prompting/index.js';
import { getProviderSettings, ProviderVisionProbe, type VisionProbe } from '../modules/providers/index.js';
import { getRunningRuntimeEndpoint } from '../modules/runtime/index.js';
import type { Clock } from '../platform/clock/clock.js';
import { systemClock } from '../platform/clock/system-clock.js';
import { type ApiLogger, createApiLogger } from '../platform/logging/api-logger.js';
import { globalHttpFetch } from '../platform/outbound-http/global-http-fetch.js';
import type { HttpFetch } from '../platform/outbound-http/http-fetch.js';
import { createBuiltinTokenizeTargetResolver } from './resolve-builtin-tokenize-target.js';

export interface ApiDependencies {
  readonly config: ApiConfig;
  readonly logger: ApiLogger;
  readonly clock: Clock;
  readonly httpFetch: HttpFetch;
  readonly chatCompletionClient: ChatCompletionClient;
  readonly chatRepository: ChatRepository;
  readonly generationJobs: GenerationJobRegistry;
  readonly tokenCounter: TokenCounter;
  readonly visionProbe: VisionProbe;
}

export type ApiDependencyOverrides = Partial<Omit<ApiDependencies, 'config'>>;

export function createApiDependencies(config: ApiConfig, overrides: ApiDependencyOverrides = {}): ApiDependencies {
  const clock = overrides.clock ?? systemClock;
  const httpFetch = overrides.httpFetch ?? globalHttpFetch;
  const logger = overrides.logger ?? createApiLogger(config.logLevel);

  return {
    config,
    logger,
    clock,
    httpFetch,
    chatCompletionClient: overrides.chatCompletionClient ?? createChatCompletionClient({ httpFetch }),
    // TODO: hand the repository the configured data root and a write queue of its own (F-38)
    chatRepository: overrides.chatRepository ?? new FileChatRepository(),
    generationJobs: overrides.generationJobs ?? new InMemoryGenerationJobRegistry({ clock }),
    tokenCounter:
      overrides.tokenCounter ??
      new ProviderTokenCounter({
        clock,
        httpFetch,
        // TODO: bind the tokenize target from the composed providers module instead of these exports (SP-10c)
        resolveTokenizeTarget: createBuiltinTokenizeTargetResolver({
          log: logger,
          providers: { getProviderSettings: () => getProviderSettings() },
          runtime: { getRunningRuntimeEndpoint: () => getRunningRuntimeEndpoint() },
        }),
      }),
    visionProbe: overrides.visionProbe ?? new ProviderVisionProbe({ clock, httpFetch }),
  };
}
