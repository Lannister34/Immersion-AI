import type {
  ChatCompletionClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from '../application/chat-completion-client.js';
import { AnthropicClient } from './anthropic/client.js';
import { OpenAiClient } from './openai/client.js';

class RoutingChatCompletionsClient implements ChatCompletionClient {
  private readonly anthropic = new AnthropicClient();
  private readonly openAi = new OpenAiClient();

  async completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const client = request.endpoint.apiKind === 'anthropic' ? this.anthropic : this.openAi;

    return client.completeChat(request);
  }
}

export function createChatCompletionClient(): ChatCompletionClient {
  return new RoutingChatCompletionsClient();
}
