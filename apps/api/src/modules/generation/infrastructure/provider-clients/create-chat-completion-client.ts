import type { ChatCompletionClient } from '../../application/chat-completion-client.js';
import { RoutingChatCompletionClient } from './routing-chat-completion-client.js';

export function createChatCompletionClient(): ChatCompletionClient {
  return new RoutingChatCompletionClient();
}
