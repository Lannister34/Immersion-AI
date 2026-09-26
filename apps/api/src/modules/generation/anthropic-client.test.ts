import { describe, expect, it, vi } from 'vitest';

import type { ChatCompletionRequest } from './application/chat-completion-client.js';
import { AnthropicMessagesClient, buildAnthropicPayload } from './infrastructure/anthropic-messages-client.js';

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

interface CapturedRequest {
  body: Record<string, unknown>;
  headers: Record<string, string>;
  url: string;
}

function mockFetch(body: string, contentType: string) {
  const captured: CapturedRequest[] = [];

  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    captured.push({
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : {},
      headers: (init?.headers ?? {}) as Record<string, string>,
      url: String(input),
    });

    return new Response(body, { headers: { 'Content-Type': contentType }, status: 200 });
  }) as unknown as typeof fetch;

  return captured;
}

function jsonReply(text: string, thinking?: string): string {
  return JSON.stringify({
    content: [...(thinking ? [{ thinking, type: 'thinking' }] : []), { text, type: 'text' }],
  });
}

function sseBody(events: Array<Record<string, unknown>>): string {
  return events.map((event) => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}

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

describe('AnthropicMessagesClient', () => {
  it('posts to /v1/messages with the key in x-api-key and the API version in a header, not in the URL', async () => {
    const captured = mockFetch(jsonReply('Здравствуй.'), 'application/json');
    const response = await new AnthropicMessagesClient().completeChat(BASE_REQUEST);

    expect(captured[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(captured[0]?.headers['x-api-key']).toBe('sk-ant-test');
    expect(captured[0]?.headers['anthropic-version']).toBe('2023-06-01');
    expect(captured[0]?.body.system).toBe('Ты — рассказчик.');
    expect(response.content).toBe('Здравствуй.');
  });

  it('clamps temperature to 1 and drops repetition penalties, which the Anthropic API does not accept', async () => {
    const captured = mockFetch(jsonReply('Ага.'), 'application/json');
    await new AnthropicMessagesClient().completeChat(BASE_REQUEST);

    expect(captured[0]?.body.temperature).toBe(1);
    expect(captured[0]?.body.top_k).toBe(40);
    expect(captured[0]?.body).not.toHaveProperty('presence_penalty');
    expect(captured[0]?.body).not.toHaveProperty('rep_pen');
    expect(captured[0]?.body).not.toHaveProperty('min_p');
  });

  it('sends Claude either temperature or top_p, since newer Claude models reject both together', async () => {
    const captured = mockFetch(jsonReply('Ага.'), 'application/json');
    await new AnthropicMessagesClient().completeChat({
      ...BASE_REQUEST,
      sampling: { ...BASE_REQUEST.sampling, temperature: 0.7, topP: 0.9 },
    });

    expect(captured[0]?.body.temperature).toBe(0.7);
    expect(captured[0]?.body).not.toHaveProperty('top_p');
  });

  it('keeps thinking blocks out of the reply', async () => {
    mockFetch(jsonReply('Ответ.', 'Взвешиваю варианты.'), 'application/json');
    const response = await new AnthropicMessagesClient().completeChat(BASE_REQUEST);

    expect(response.content).toBe('Ответ.');
    expect(response.reasoning).toBe('Взвешиваю варианты.');
  });

  it('passes over content blocks of unknown types, such as tool_use and redacted_thinking, without failing', async () => {
    mockFetch(
      JSON.stringify({
        content: [
          { data: 'opaque', type: 'redacted_thinking' },
          { id: 'toolu_1', input: {}, name: 'search', type: 'tool_use' },
          { text: 'Ответ.', type: 'text' },
        ],
      }),
      'application/json',
    );
    const response = await new AnthropicMessagesClient().completeChat(BASE_REQUEST);

    expect(response).toEqual({ content: 'Ответ.', reasoning: '' });
  });

  it('never forwards server extensions, which the Anthropic API would reject', async () => {
    const captured = mockFetch(jsonReply('Ага.'), 'application/json');
    await new AnthropicMessagesClient().completeChat({ ...BASE_REQUEST, serverExtensions: { enable_thinking: false } });

    expect(captured[0]?.body).not.toHaveProperty('enable_thinking');
  });

  it('reports streamed text and thinking on their own channels', async () => {
    mockFetch(
      sseBody([
        { type: 'message_start' },
        { delta: { thinking: 'Думаю…', type: 'thinking_delta' }, type: 'content_block_delta' },
        { delta: { text: 'Прив', type: 'text_delta' }, type: 'content_block_delta' },
        { delta: { text: 'ет.', type: 'text_delta' }, type: 'content_block_delta' },
        { type: 'message_stop' },
      ]),
      'text/event-stream',
    );
    const deltas: Array<[string, string]> = [];

    const response = await new AnthropicMessagesClient().completeChat({
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
    mockFetch(
      sseBody([
        { delta: { text: '<think>Прикидываю</think>', type: 'text_delta' }, type: 'content_block_delta' },
        { delta: { text: 'Ответ.', type: 'text_delta' }, type: 'content_block_delta' },
        { type: 'message_stop' },
      ]),
      'text/event-stream',
    );
    const deltas: Array<[string, string]> = [];

    const response = await new AnthropicMessagesClient().completeChat({
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
    mockFetch(sseBody([{ error: { message: 'overloaded_error' }, type: 'error' }]), 'text/event-stream');

    await expect(
      new AnthropicMessagesClient().completeChat({ ...BASE_REQUEST, onDelta: () => undefined }),
    ).rejects.toThrow(/overloaded_error/u);
  });
});
