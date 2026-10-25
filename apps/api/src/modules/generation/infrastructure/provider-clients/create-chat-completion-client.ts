import type { ChatCompletionClient } from '../../application/chat-completion-client.js';
import type { ProviderClientDependencies } from './provider-client-dependencies.js';
import { RoutingChatCompletionClient } from './routing-chat-completion-client.js';

export function createChatCompletionClient(dependencies: ProviderClientDependencies): ChatCompletionClient {
  return new RoutingChatCompletionClient(dependencies);
}
