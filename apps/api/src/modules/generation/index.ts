export const generationModuleId = 'generation' as const;

export type { ChatCompletionClient } from './application/chat-completion-client.js';
export { ProviderGenerationError } from './application/generation-errors.js';
export { createChatCompletionClient } from './infrastructure/provider-clients/create-chat-completion-client.js';
export { getProviderTokenCounter } from './infrastructure/provider-clients/shared-token-counter.js';
