import type {
  ChatCompletionClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from '../../application/chat-completion-client.js';
import { AnthropicClient } from './anthropic/client.js';
import { OpenAiClient } from './openai/client.js';
import type { ProviderClientDependencies } from './provider-client-dependencies.js';

export class RoutingChatCompletionClient implements ChatCompletionClient {
  private readonly anthropic: AnthropicClient;
  private readonly openAi: OpenAiClient;

  constructor(dependencies: ProviderClientDependencies) {
    this.anthropic = new AnthropicClient(dependencies);
    this.openAi = new OpenAiClient(dependencies);
  }

  async completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const client = request.endpoint.apiKind === 'anthropic' ? this.anthropic : this.openAi;

    return client.completeChat(request);
  }
}
