import type {
  ChatCompletionClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from '../application/chat-completion-client.js';
import { AnthropicMessagesClient } from './anthropic-messages-client.js';
import { OpenAiCompatibleChatCompletionsClient } from './openai-compatible-chat-completions-client.js';

/**
 * Диалект выбирается по конкретному запросу, а не при создании клиента:
 * пользователь переключает провайдера в настройках между двумя генерациями,
 * и вызывающему коду знать об этом незачем.
 */
class RoutingChatCompletionsClient implements ChatCompletionClient {
  private readonly anthropic = new AnthropicMessagesClient();
  private readonly openAiCompatible = new OpenAiCompatibleChatCompletionsClient();

  async completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const client = request.endpoint.apiKind === 'anthropic' ? this.anthropic : this.openAiCompatible;

    return client.completeChat(request);
  }
}

export function createChatCompletionClient(): ChatCompletionClient {
  return new RoutingChatCompletionsClient();
}
