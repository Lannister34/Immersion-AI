import { describe, expect, it, vi } from 'vitest';

import type { ChatCompletionRequest } from './application/chat-completion-client.js';
import { ProviderGenerationError } from './application/generation-errors.js';
import { OpenAiCompatibleChatCompletionsClient } from './infrastructure/openai-compatible-chat-completions-client.js';

const BASE_REQUEST: Omit<ChatCompletionRequest, 'onDelta'> = {
  endpoint: { apiKey: null, apiKind: 'openai-compatible', baseUrl: 'http://127.0.0.1:5001', model: 'test-model' },
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
  const requests: Array<Record<string, unknown>> = [];

  globalThis.fetch = vi.fn<typeof fetch>(async (_input, init) => {
    requests.push(typeof init?.body === 'string' ? JSON.parse(init.body) : {});

    return new Response(body, { headers: { 'Content-Type': contentType }, status: 200 });
  });

  return requests;
}

function sseBody(deltas: string[]): string {
  return [
    ...deltas.map((delta) => `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`),
    'data: [DONE]\n\n',
  ].join('');
}

describe('OpenAiCompatibleChatCompletionsClient request body', () => {
  it('sends the extended sampler set to a local server', async () => {
    const captured = mockFetch(JSON.stringify({ choices: [{ message: { content: 'раз' } }] }), 'application/json');
    await new OpenAiCompatibleChatCompletionsClient().completeChat(BASE_REQUEST);

    expect(captured[0]).toMatchObject({ max_tokens: 128, min_p: 0, rep_pen: 1, top_k: 0 });
  });

  it('drops parameters the OpenAI cloud rejects and sends the reply limit as max_completion_tokens, which gpt-4o accepts too', async () => {
    const captured = mockFetch(JSON.stringify({ choices: [{ message: { content: 'раз' } }] }), 'application/json');
    await new OpenAiCompatibleChatCompletionsClient().completeChat({
      ...BASE_REQUEST,
      endpoint: { ...BASE_REQUEST.endpoint, apiKind: 'openai-cloud', model: 'gpt-4o' },
    });

    const body = captured[0];
    expect(body?.max_completion_tokens).toBe(128);
    expect(body?.temperature).toBe(1);
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('min_p');
    expect(body).not.toHaveProperty('rep_pen');
    expect(body).not.toHaveProperty('top_k');
  });

  it('leaves samplers alone for reasoning models, which only accept defaults', async () => {
    const captured = mockFetch(JSON.stringify({ choices: [{ message: { content: 'раз' } }] }), 'application/json');
    await new OpenAiCompatibleChatCompletionsClient().completeChat({
      ...BASE_REQUEST,
      endpoint: { ...BASE_REQUEST.endpoint, apiKind: 'openai-cloud', model: 'o3-mini' },
    });

    const body = captured[0];
    expect(body?.max_completion_tokens).toBe(128);
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
    expect(body).not.toHaveProperty('presence_penalty');
  });

  it('sends server extensions to a local server only, since the OpenAI cloud rejects unknown fields', async () => {
    const local = mockFetch(JSON.stringify({ choices: [{ message: { content: 'раз' } }] }), 'application/json');
    await new OpenAiCompatibleChatCompletionsClient().completeChat({
      ...BASE_REQUEST,
      serverExtensions: { enable_thinking: false },
    });

    expect(local[0]).toMatchObject({ enable_thinking: false });

    const cloud = mockFetch(JSON.stringify({ choices: [{ message: { content: 'раз' } }] }), 'application/json');
    await new OpenAiCompatibleChatCompletionsClient().completeChat({
      ...BASE_REQUEST,
      endpoint: { ...BASE_REQUEST.endpoint, apiKind: 'openai-cloud', model: 'gpt-4o' },
      serverExtensions: { enable_thinking: false },
    });

    expect(cloud[0]).not.toHaveProperty('enable_thinking');
  });

  it('lets our own fields win over server extensions of the same name', async () => {
    const captured = mockFetch(JSON.stringify({ choices: [{ message: { content: 'раз' } }] }), 'application/json');
    await new OpenAiCompatibleChatCompletionsClient().completeChat({
      ...BASE_REQUEST,
      serverExtensions: { max_tokens: 1, model: 'other-model', stream: true, top_k: 99 },
    });

    expect(captured[0]).toMatchObject({ max_tokens: 128, model: 'test-model', stream: false, top_k: 0 });
  });
});

describe('OpenAiCompatibleChatCompletionsClient replies', () => {
  it('fails an empty reply unless the caller allows it, since thinking can use up the whole limit', async () => {
    const thinkingOnly = JSON.stringify({ choices: [{ message: { content: '<think>Весь лимит ушёл сюда' } }] });
    const client = new OpenAiCompatibleChatCompletionsClient();

    mockFetch(thinkingOnly, 'application/json');
    await expect(client.completeChat(BASE_REQUEST)).rejects.toThrow('Provider returned an empty reply.');

    mockFetch(thinkingOnly, 'application/json');
    await expect(client.completeChat({ ...BASE_REQUEST, allowEmptyContent: true })).resolves.toEqual({
      content: '',
      reasoning: 'Весь лимит ушёл сюда',
    });
  });

  it('cuts a long provider error body down to its first 500 characters', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async () => new Response('x'.repeat(2000), { status: 500 }));

    await expect(new OpenAiCompatibleChatCompletionsClient().completeChat(BASE_REQUEST)).rejects.toThrow(
      /^Provider returned HTTP 500: x{500}$/u,
    );
  });
});

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

    expect(streamed[0]?.stream).toBe(true);

    const plain = mockFetch(JSON.stringify({ choices: [{ message: { content: 'раз' } }] }), 'application/json');
    await client.completeChat(BASE_REQUEST);

    expect(plain[0]?.stream).toBe(false);
  });

  it('falls back to the plain response when the server answers a stream request with JSON, going by content-type', async () => {
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

    globalThis.fetch = vi.fn<typeof fetch>(async () => {
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
    });

    const deltas: string[] = [];
    const client = new OpenAiCompatibleChatCompletionsClient();
    const response = await client.completeChat({ ...BASE_REQUEST, onDelta: (delta) => deltas.push(delta) });

    expect(deltas).toEqual(['склеено']);
    expect(response.content).toBe('склеено');
  });

  it('fails on an in-band error chunk instead of returning the reply streamed so far', async () => {
    mockFetch(
      [
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Half a rep' } }] })}\n\n`,
        `data: ${JSON.stringify({ error: { message: 'CUDA error: out of memory', type: 'server_error' } })}\n\n`,
        'data: [DONE]\n\n',
      ].join(''),
      'text/event-stream',
    );
    const deltas: string[] = [];

    const completion = new OpenAiCompatibleChatCompletionsClient().completeChat({
      ...BASE_REQUEST,
      onDelta: (delta) => deltas.push(delta),
    });

    await expect(completion).rejects.toBeInstanceOf(ProviderGenerationError);
    await expect(completion).rejects.toThrow(/CUDA error: out of memory/u);
    expect(deltas).toEqual(['Half a rep']);
  });

  it('cancels the provider stream when a chunk fails, so the server stops generating', async () => {
    let canceled = false;
    globalThis.fetch = vi.fn<typeof fetch>(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ error: 'out of memory' })}\n\n`));
        },
        cancel() {
          canceled = true;
        },
      });

      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' }, status: 200 });
    });

    await expect(
      new OpenAiCompatibleChatCompletionsClient().completeChat({ ...BASE_REQUEST, onDelta: () => undefined }),
    ).rejects.toThrow(/out of memory/u);
    expect(canceled).toBe(true);
  });

  it('reports the provider error even when cancelling the stream fails as well', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ error: 'out of memory' })}\n\n`));
        },
        cancel() {
          throw new Error('cancel failed');
        },
      });

      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' }, status: 200 });
    });

    await expect(
      new OpenAiCompatibleChatCompletionsClient().completeChat({ ...BASE_REQUEST, onDelta: () => undefined }),
    ).rejects.toThrow(/out of memory/u);
  });

  it('fails on an in-band error given as a bare string', async () => {
    mockFetch(`data: ${JSON.stringify({ error: 'upstream closed the connection' })}\n\n`, 'text/event-stream');

    await expect(
      new OpenAiCompatibleChatCompletionsClient().completeChat({ ...BASE_REQUEST, onDelta: () => undefined }),
    ).rejects.toThrow(/upstream closed the connection/u);
  });

  it('streams the separate reasoning fields of DeepSeek-style servers straight to the reasoning channel', async () => {
    mockFetch(
      [
        `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'Ду' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { reasoning: 'маю' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Ответ.' } }] })}\n\n`,
        'data: [DONE]\n\n',
      ].join(''),
      'text/event-stream',
    );
    const deltas: Array<[string, string]> = [];

    const response = await new OpenAiCompatibleChatCompletionsClient().completeChat({
      ...BASE_REQUEST,
      onDelta: (delta, channel) => deltas.push([channel, delta]),
    });

    expect(deltas).toEqual([
      ['reasoning', 'Ду'],
      ['reasoning', 'маю'],
      ['reply', 'Ответ.'],
    ]);
    expect(response).toEqual({ content: 'Ответ.', reasoning: 'Думаю' });
  });
});
