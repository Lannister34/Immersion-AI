export const generationModuleId = 'generation' as const;

export type {
  ChatCompletionClient,
  ChatCompletionEndpoint,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionSamplingOptions,
} from './application/chat-completion-client.js';
export { ProviderGenerationError } from './application/generation-errors.js';
export {
  createGenerationModule,
  type GenerationModule,
  type GenerationModuleDependencies,
} from './generation-module.js';
export { createChatCompletionClient } from './infrastructure/provider-clients/create-chat-completion-client.js';
export { getProviderTokenCounter } from './infrastructure/provider-clients/shared-token-counter.js';
export { generationProblems } from './interface/http/generation-problems.js';
