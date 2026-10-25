import type {
  ChatCompletionClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from '../modules/generation/index.js';

export interface ScriptedChatCompletion {
  readonly content: string;
  readonly reasoning?: string;
}

export class FakeChatCompletionClient implements ChatCompletionClient {
  readonly #requests: ChatCompletionRequest[] = [];
  readonly #replies: ScriptedChatCompletion[] = [];

  get requests(): readonly ChatCompletionRequest[] {
    return this.#requests;
  }

  reply(completion: ScriptedChatCompletion): this {
    this.#replies.push(completion);

    return this;
  }

  completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    this.#requests.push(request);
    const next = this.#replies.shift();

    if (next === undefined) {
      return Promise.reject(new Error('FakeChatCompletionClient has no scripted reply left.'));
    }

    return Promise.resolve({ content: next.content, reasoning: next.reasoning ?? '' });
  }
}
