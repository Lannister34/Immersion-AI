export const generationModuleId = 'generation' as const;

export type {
  ChatCompletionClient,
  ChatCompletionEndpoint,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionSamplingOptions,
} from './application/chat-completion-client.js';
export { ProviderGenerationError } from './application/generation-errors.js';
export type { GenerationJobRegistry } from './application/generation-job-registry.js';
export type {
  AssistantMessageContinuation,
  ChatAttachmentReference,
  ChatMessageAppend,
  ChatSessionPort,
  ChatTitleUpdate,
} from './application/generation-ports.js';
export {
  createGenerationModule,
  type GenerationModule,
  type GenerationModuleDependencies,
} from './generation-module.js';
export { InMemoryGenerationJobRegistry } from './infrastructure/in-memory-generation-job-registry.js';
export { createChatCompletionClient } from './infrastructure/provider-clients/create-chat-completion-client.js';
export { ProviderTokenCounter, type TokenizeTarget } from './infrastructure/provider-clients/token-counter.js';
export { generationProblems } from './interface/http/generation-problems.js';
