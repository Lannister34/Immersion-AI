import type {
  ChatCompletionClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from '../application/chat-completion-client.js';

export class InFlightChatCompletionClient implements ChatCompletionClient {
  private inFlight = 0;

  constructor(private readonly inner: ChatCompletionClient) {}

  hasInFlightCompletion(): boolean {
    return this.inFlight > 0;
  }

  async completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    this.inFlight += 1;

    try {
      return await this.inner.completeChat(request);
    } finally {
      this.inFlight -= 1;
    }
  }
}
