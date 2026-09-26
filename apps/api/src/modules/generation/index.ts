export const generationModuleId = 'generation' as const;

export type { ChatCompletionClient } from './application/chat-completion-client.js';
export { ProviderGenerationError } from './application/generation-errors.js';
export { createChatCompletionClient } from './infrastructure/chat-completion-client-factory.js';
export { getProviderTokenCounter } from './infrastructure/provider-token-counter.js';
