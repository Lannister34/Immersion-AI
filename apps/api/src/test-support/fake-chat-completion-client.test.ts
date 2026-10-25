import { describe, expect, it } from 'vitest';

import type { ChatCompletionRequest } from '../modules/generation/index.js';
import { FakeChatCompletionClient } from './fake-chat-completion-client.js';

const REQUEST: ChatCompletionRequest = {
  endpoint: { apiKey: null, apiKind: 'openai-compatible', baseUrl: 'http://127.0.0.1:6007', model: 'm' },
  maxTokens: 8,
  messages: [{ content: 'Привет.', role: 'user' }],
  sampling: { minP: 0, presencePenalty: 0, repeatPenalty: 1, repeatPenaltyRange: 0, temperature: 0, topK: 0, topP: 1 },
};

describe('FakeChatCompletionClient', () => {
  it('answers with the scripted replies in order and records every request', async () => {
    const client = new FakeChatCompletionClient()
      .reply({ content: 'первый' })
      .reply({ content: '', reasoning: 'мысль' });

    await expect(client.completeChat(REQUEST)).resolves.toEqual({ content: 'первый', reasoning: '' });
    await expect(client.completeChat(REQUEST)).resolves.toEqual({ content: '', reasoning: 'мысль' });
    expect(client.requests).toEqual([REQUEST, REQUEST]);
  });

  it('rejects a request it has no scripted reply for, after recording it', async () => {
    const client = new FakeChatCompletionClient();

    await expect(client.completeChat(REQUEST)).rejects.toThrow('no scripted reply');
    expect(client.requests).toEqual([REQUEST]);
  });
});
