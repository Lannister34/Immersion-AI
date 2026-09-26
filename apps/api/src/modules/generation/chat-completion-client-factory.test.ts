import { describe, expect, it, vi } from 'vitest';

import type { ChatCompletionRequest } from './application/chat-completion-client.js';
import { createChatCompletionClient } from './infrastructure/chat-completion-client-factory.js';

function requestFor(endpoint: ChatCompletionRequest['endpoint']): ChatCompletionRequest {
  return {
    endpoint,
    maxTokens: 64,
    messages: [{ content: 'Привет.', role: 'user' }],
    sampling: {
      minP: 0,
      presencePenalty: 0,
      repeatPenalty: 1,
      repeatPenaltyRange: 0,
      temperature: 1,
      topK: 0,
      topP: 1,
    },
  };
}

describe('createChatCompletionClient', () => {
  it('picks the dialect per request, so one client follows a provider switch between generations', async () => {
    const urls: string[] = [];

    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      const body = url.endsWith('/messages')
        ? { content: [{ text: 'Claude.', type: 'text' }] }
        : { choices: [{ message: { content: 'Local.' } }] };
      urls.push(url);

      return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, status: 200 });
    }) as unknown as typeof fetch;
    const client = createChatCompletionClient();

    const anthropicReply = await client.completeChat(
      requestFor({
        apiKey: 'sk-ant-test',
        apiKind: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        model: 'claude-sonnet-4-5',
      }),
    );
    const localReply = await client.completeChat(
      requestFor({
        apiKey: null,
        apiKind: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:5001',
        model: 'local-model',
      }),
    );

    expect(urls).toEqual(['https://api.anthropic.com/v1/messages', 'http://127.0.0.1:5001/v1/chat/completions']);
    expect([anthropicReply.content, localReply.content]).toEqual(['Claude.', 'Local.']);
  });
});
