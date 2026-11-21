import { describe, expect, it } from 'vitest';

import { createDeferred } from '../../../test-support/deferred.js';
import type {
  ChatCompletionClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from '../application/chat-completion-client.js';
import { InFlightChatCompletionClient } from './in-flight-chat-completion-client.js';

const REQUEST: ChatCompletionRequest = {
  endpoint: {
    apiKey: null,
    apiKind: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:6006',
    contextSize: null,
    model: 'm',
  },
  maxTokens: null,
  messages: [{ content: 'Привет.', role: 'user' }],
  sampling: { minP: 0, presencePenalty: 0, repeatPenalty: 1, repeatPenaltyRange: 0, temperature: 1, topK: 0, topP: 1 },
};

const REPLY: ChatCompletionResponse = { content: 'Ответ.', reasoning: '', stoppedAtTokenLimit: false };

describe('InFlightChatCompletionClient', () => {
  it('reports a completion in flight from the call until it settles, whoever the caller is', async () => {
    const held = createDeferred<ChatCompletionResponse>();
    const inner: ChatCompletionClient = { completeChat: () => held.promise };
    const client = new InFlightChatCompletionClient(inner);

    expect(client.hasInFlightCompletion()).toBe(false);

    const completion = client.completeChat(REQUEST);

    expect(client.hasInFlightCompletion()).toBe(true);

    held.resolve(REPLY);
    await expect(completion).resolves.toEqual(REPLY);
    expect(client.hasInFlightCompletion()).toBe(false);
  });

  it('stops counting a completion that fails', async () => {
    const client = new InFlightChatCompletionClient({ completeChat: () => Promise.reject(new Error('сбой')) });

    await expect(client.completeChat(REQUEST)).rejects.toThrow('сбой');
    expect(client.hasInFlightCompletion()).toBe(false);
  });
});
