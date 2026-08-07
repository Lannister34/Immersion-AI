import { describe, expect, it, vi } from 'vitest';

import type { ChatCompletionRequest } from './application/chat-completion-client.js';
import { OpenAiCompatibleChatCompletionsClient } from './infrastructure/openai-compatible-chat-completions-client.js';

const BASE_REQUEST: Omit<ChatCompletionRequest, 'onDelta'> = {
  endpoint: { apiKey: null, baseUrl: 'http://127.0.0.1:5001', model: 'test-model' },
  maxTokens: 128,
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

function mockFetch(body: string, contentType: string) {
  const requests: unknown[] = [];

  globalThis.fetch = vi.fn(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    requests.push(typeof init?.body === 'string' ? JSON.parse(init.body) : null);

    return new Response(body, { headers: { 'Content-Type': contentType }, status: 200 });
  }) as unknown as typeof fetch;

  return requests;
}

function sseBody(deltas: string[]): string {
  return [
    ...deltas.map((delta) => `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`),
    'data: [DONE]\n\n',
  ].join('');
}

describe('OpenAiCompatibleChatCompletionsClient streaming', () => {
  it('reports every chunk in order and returns the joined reply', async () => {
    mockFetch(sseBody(['Прив', 'ет, ', 'мир.']), 'text/event-stream');
    const deltas: string[] = [];
    const client = new OpenAiCompatibleChatCompletionsClient();

    const response = await client.completeChat({ ...BASE_REQUEST, onDelta: (delta) => deltas.push(delta) });

    expect(deltas).toEqual(['Прив', 'ет, ', 'мир.']);
    expect(response.content).toBe('Привет, мир.');
  });

  it('asks for a stream only when a delta callback is given', async () => {
    const streamed = mockFetch(sseBody(['раз']), 'text/event-stream');
    const client = new OpenAiCompatibleChatCompletionsClient();
    await client.completeChat({ ...BASE_REQUEST, onDelta: () => undefined });

    expect((streamed[0] as { stream: boolean }).stream).toBe(true);

    const plain = mockFetch(JSON.stringify({ choices: [{ message: { content: 'раз' } }] }), 'application/json');
    await client.completeChat(BASE_REQUEST);

    expect((plain[0] as { stream: boolean }).stream).toBe(false);
  });

  it('falls back to the plain response when the server ignores the stream request', async () => {
    mockFetch(JSON.stringify({ choices: [{ message: { content: 'Целый ответ.' } }] }), 'application/json');
    const deltas: string[] = [];
    const client = new OpenAiCompatibleChatCompletionsClient();

    const response = await client.completeChat({ ...BASE_REQUEST, onDelta: (delta) => deltas.push(delta) });

    expect(deltas).toEqual([]);
    expect(response.content).toBe('Целый ответ.');
  });

  it('survives a chunk split across two reads of the stream', async () => {
    const chunk = `data: ${JSON.stringify({ choices: [{ delta: { content: 'склеено' } }] })}\n\n`;
    const head = chunk.slice(0, 20);
    const tail = chunk.slice(20);

    globalThis.fetch = vi.fn(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(head));
          controller.enqueue(encoder.encode(tail));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' }, status: 200 });
    }) as unknown as typeof fetch;

    const deltas: string[] = [];
    const client = new OpenAiCompatibleChatCompletionsClient();
    const response = await client.completeChat({ ...BASE_REQUEST, onDelta: (delta) => deltas.push(delta) });

    expect(deltas).toEqual(['склеено']);
    expect(response.content).toBe('склеено');
  });
});
