import { describe, expect, it } from 'vitest';

import { stubGlobalFetch } from '../../../../../test-support/global-fetch-stub.js';
import { readProviderChatRequest } from '../../../../../test-support/provider-chat-request.js';
import { anthropicMessage, anthropicMessageStream } from '../../../../../test-support/provider-responses.js';
import type { ChatCompletionRequest } from '../../../application/chat-completion-client.js';
import { AnthropicClient } from './client.js';
import { buildAnthropicPayload } from './request.js';

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

const BASE_REQUEST: Omit<ChatCompletionRequest, 'onDelta'> = {
  endpoint: {
    apiKey: 'sk-ant-test',
    apiKind: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-5',
  },
  maxTokens: 256,
  messages: [
    { content: 'Ты — рассказчик.', role: 'system' },
    { content: 'Привет.', role: 'user' },
  ],
  sampling: {
    minP: 0,
    presencePenalty: 0.5,
    repeatPenalty: 1.1,
    repeatPenaltyRange: 256,
    temperature: 1.4,
    topK: 40,
    topP: 0.9,
  },
};

describe('buildAnthropicPayload', () => {
  it('lifts system messages out of the conversation and joins them', () => {
    const { conversation, system } = buildAnthropicPayload([
      { content: 'Правила.', role: 'system' },
      { content: 'Мир.', role: 'system' },
      { content: 'Привет.', role: 'user' },
    ]);

    expect(system).toBe('Правила.\n\nМир.');
    expect(conversation).toEqual([{ content: [{ text: 'Привет.', type: 'text' }], role: 'user' }]);
  });

  it('merges neighbouring messages of the same role, since Anthropic requires alternating roles', () => {
    const { conversation } = buildAnthropicPayload([
      { content: 'Раз.', role: 'user' },
      { content: 'Два.', role: 'user' },
      { content: 'Ответ.', role: 'assistant' },
    ]);

    expect(conversation).toHaveLength(2);
    expect(conversation[0]?.content).toEqual([
      { text: 'Раз.', type: 'text' },
      { text: 'Два.', type: 'text' },
    ]);
  });

  it('opens a transcript that starts with the character reply with a user turn, since Anthropic wants the user first', () => {
    const { conversation } = buildAnthropicPayload([{ content: 'Здравствуй, путник.', role: 'assistant' }]);

    expect(conversation[0]?.role).toBe('user');
    expect(conversation[1]?.role).toBe('assistant');
  });

  it('sends data-URL images as base64 blocks and drops images linked in any other form', () => {
    const { conversation } = buildAnthropicPayload([
      { content: 'Что тут?', images: ['data:image/png;base64,AAAB', 'https://example.test/a.png'], role: 'user' },
    ]);

    expect(conversation[0]?.content).toEqual([
      { source: { data: 'AAAB', media_type: 'image/png', type: 'base64' }, type: 'image' },
      { text: 'Что тут?', type: 'text' },
    ]);
  });
});

describe('AnthropicClient', () => {
  it('posts to /v1/messages with the key in x-api-key and the API version in a header, not in the URL', async () => {
    const http = stubGlobalFetch();
    http.on('POST', MESSAGES_URL, () => anthropicMessage('Здравствуй.'));

    const response = await new AnthropicClient().completeChat(BASE_REQUEST);

    expect(http.requestLines()).toEqual([`POST ${MESSAGES_URL}`]);
    expect(http.requests[0]?.headers.get('x-api-key')).toBe('sk-ant-test');
    expect(http.requests[0]?.headers.get('anthropic-version')).toBe('2023-06-01');
    expect(readProviderChatRequest(http).system).toBe('Ты — рассказчик.');
    expect(response.content).toBe('Здравствуй.');
  });

  it('clamps temperature to 1 and drops repetition penalties, which the Anthropic API does not accept', async () => {
    const http = stubGlobalFetch();
    http.on('POST', MESSAGES_URL, () => anthropicMessage('Ага.'));

    await new AnthropicClient().completeChat(BASE_REQUEST);
    const body = readProviderChatRequest(http);

    expect(body.temperature).toBe(1);
    expect(body.top_k).toBe(40);
    expect(body).not.toHaveProperty('presence_penalty');
    expect(body).not.toHaveProperty('rep_pen');
    expect(body).not.toHaveProperty('min_p');
  });

  it('sends Claude either temperature or top_p, since newer Claude models reject both together', async () => {
    const http = stubGlobalFetch();
    http.on('POST', MESSAGES_URL, () => anthropicMessage('Ага.'));

    await new AnthropicClient().completeChat({
      ...BASE_REQUEST,
      sampling: { ...BASE_REQUEST.sampling, temperature: 0.7, topP: 0.9 },
    });
    const body = readProviderChatRequest(http);

    expect(body.temperature).toBe(0.7);
    expect(body).not.toHaveProperty('top_p');
  });

  it('keeps thinking blocks out of the reply', async () => {
    const http = stubGlobalFetch();
    http.on('POST', MESSAGES_URL, () =>
      Response.json({
        content: [
          { thinking: 'Взвешиваю варианты.', type: 'thinking' },
          { text: 'Ответ.', type: 'text' },
        ],
      }),
    );

    const response = await new AnthropicClient().completeChat(BASE_REQUEST);

    expect(response.content).toBe('Ответ.');
    expect(response.reasoning).toBe('Взвешиваю варианты.');
  });

  it('passes over content blocks of unknown types, such as tool_use and redacted_thinking, without failing', async () => {
    const http = stubGlobalFetch();
    http.on('POST', MESSAGES_URL, () =>
      Response.json({
        content: [
          { data: 'opaque', type: 'redacted_thinking' },
          { id: 'toolu_1', input: {}, name: 'search', type: 'tool_use' },
          { text: 'Ответ.', type: 'text' },
        ],
      }),
    );

    const response = await new AnthropicClient().completeChat(BASE_REQUEST);

    expect(response).toEqual({ content: 'Ответ.', reasoning: '' });
  });

  it('never forwards server extensions, which the Anthropic API would reject', async () => {
    const http = stubGlobalFetch();
    http.on('POST', MESSAGES_URL, () => anthropicMessage('Ага.'));

    await new AnthropicClient().completeChat({ ...BASE_REQUEST, serverExtensions: { enable_thinking: false } });

    expect(readProviderChatRequest(http)).not.toHaveProperty('enable_thinking');
  });

  it('reports streamed text and thinking on their own channels', async () => {
    const http = stubGlobalFetch();
    http.on('POST', MESSAGES_URL, () =>
      anthropicMessageStream([
        { type: 'message_start' },
        { delta: { thinking: 'Думаю…', type: 'thinking_delta' }, type: 'content_block_delta' },
        { delta: { text: 'Прив', type: 'text_delta' }, type: 'content_block_delta' },
        { delta: { text: 'ет.', type: 'text_delta' }, type: 'content_block_delta' },
        { type: 'message_stop' },
      ]),
    );
    const deltas: Array<[string, string]> = [];

    const response = await new AnthropicClient().completeChat({
      ...BASE_REQUEST,
      onDelta: (delta, channel) => deltas.push([channel, delta]),
    });

    expect(deltas).toEqual([
      ['reasoning', 'Думаю…'],
      ['reply', 'Прив'],
      ['reply', 'ет.'],
    ]);
    expect(response.content).toBe('Привет.');
    expect(response.reasoning).toBe('Думаю…');
  });

  it('splits a think tag out of streamed text, which local proxies of this format emit', async () => {
    const http = stubGlobalFetch();
    http.on('POST', MESSAGES_URL, () =>
      anthropicMessageStream([
        { delta: { text: '<think>Прикидываю</think>', type: 'text_delta' }, type: 'content_block_delta' },
        { delta: { text: 'Ответ.', type: 'text_delta' }, type: 'content_block_delta' },
        { type: 'message_stop' },
      ]),
    );
    const deltas: Array<[string, string]> = [];

    const response = await new AnthropicClient().completeChat({
      ...BASE_REQUEST,
      onDelta: (delta, channel) => deltas.push([channel, delta]),
    });

    expect(deltas).toEqual([
      ['reasoning', 'Прикидываю'],
      ['reply', 'Ответ.'],
    ]);
    expect(response).toEqual({ content: 'Ответ.', reasoning: 'Прикидываю' });
  });

  it('fails loudly when the stream reports an error event', async () => {
    const http = stubGlobalFetch();
    http.on('POST', MESSAGES_URL, () =>
      anthropicMessageStream([{ error: { message: 'overloaded_error' }, type: 'error' }]),
    );

    await expect(new AnthropicClient().completeChat({ ...BASE_REQUEST, onDelta: () => undefined })).rejects.toThrow(
      /overloaded_error/u,
    );
  });
});
