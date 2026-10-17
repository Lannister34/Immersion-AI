import { describe, expect, it } from 'vitest';

import { stubGlobalFetch } from '../../../../test-support/global-fetch-stub.js';
import { anthropicMessage, openAiChatCompletion } from '../../../../test-support/provider-responses.js';
import type { ChatCompletionRequest } from '../../application/chat-completion-client.js';
import { createChatCompletionClient } from './create-chat-completion-client.js';

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
    const http = stubGlobalFetch();
    http.on('POST', 'https://api.anthropic.com/v1/messages', () => anthropicMessage('Claude.'));
    http.on('POST', 'http://127.0.0.1:5001/v1/chat/completions', () => openAiChatCompletion('Local.'));
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

    expect(http.requestLines()).toEqual([
      'POST https://api.anthropic.com/v1/messages',
      'POST http://127.0.0.1:5001/v1/chat/completions',
    ]);
    expect([anthropicReply.content, localReply.content]).toEqual(['Claude.', 'Local.']);
  });
});
