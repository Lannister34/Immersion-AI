import type { ProviderApiKind } from '@immersion/contracts/providers';
import { describe, expect, it } from 'vitest';

import { globalHttpFetch } from '../../../../platform/outbound-http/global-http-fetch.js';
import { createHttpStub } from '../../../../test-support/http-stub.js';
import { anthropicMessage, openAiChatCompletion } from '../../../../test-support/provider-responses.js';
import { startRedirectingServers } from '../../../../test-support/redirecting-servers.js';
import type { ChatCompletionRequest } from '../../application/chat-completion-client.js';
import { ProviderGenerationError } from '../../application/generation-errors.js';
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
    const http = createHttpStub();
    http.on('POST', 'https://api.anthropic.com/v1/messages', () => anthropicMessage('Claude.'));
    http.on('POST', 'http://127.0.0.1:5001/v1/chat/completions', () => openAiChatCompletion('Local.'));
    const client = createChatCompletionClient({ httpFetch: http.fetch });

    const anthropicReply = await client.completeChat(
      requestFor({
        apiKey: 'sk-ant-test',
        apiKind: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        contextSize: null,
        model: 'claude-sonnet-4-5',
      }),
    );
    const localReply = await client.completeChat(
      requestFor({
        apiKey: null,
        apiKind: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:5001',
        contextSize: null,
        model: 'local-model',
      }),
    );

    expect(http.requestLines()).toEqual([
      'POST https://api.anthropic.com/v1/messages',
      'POST http://127.0.0.1:5001/v1/chat/completions',
    ]);
    expect([anthropicReply.content, localReply.content]).toEqual(['Claude.', 'Local.']);
  });

  it.each<[ProviderApiKind, string]>([
    ['anthropic', '/v1/messages'],
    ['openai-cloud', '/v1/chat/completions'],
    ['openai-compatible', '/v1/chat/completions'],
  ])('refuses a redirect from the %s provider, so its key never reaches the redirect target', async (apiKind, path) => {
    const servers = await startRedirectingServers();
    const client = createChatCompletionClient({ httpFetch: globalHttpFetch });

    const failure = await client
      .completeChat(
        requestFor({
          apiKey: 'sk-canary-generation',
          apiKind,
          baseUrl: `${servers.redirectingOrigin}/v1`,
          contextSize: null,
          model: 'model',
        }),
      )
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ProviderGenerationError);
    expect(failure).toMatchObject({
      message: expect.stringContaining(`HTTP 307 на ${servers.collectorOrigin}${path}`),
    });
    const keyHeaders = servers.redirected.map(
      (request) => request.headers['x-api-key'] ?? request.headers.authorization,
    );
    expect(keyHeaders).toEqual([apiKind === 'anthropic' ? 'sk-canary-generation' : 'Bearer sk-canary-generation']);
    expect(servers.collected).toEqual([]);
  });
});
