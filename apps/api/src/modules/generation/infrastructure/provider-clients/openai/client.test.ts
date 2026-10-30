import { describe, expect, it } from 'vitest';

import { createDeferred } from '../../../../../test-support/deferred.js';
import { createHttpStub } from '../../../../../test-support/http-stub.js';
import { readProviderChatRequest } from '../../../../../test-support/provider-chat-request.js';
import {
  bodyHeldUntilAborted,
  eventStream,
  eventStreamResponse,
  openAiChatCompletion,
  openAiChatStream,
} from '../../../../../test-support/provider-responses.js';
import type { ChatCompletionRequest } from '../../../application/chat-completion-client.js';
import { ProviderGenerationError, ProviderReplyTruncatedError } from '../../../application/generation-errors.js';
import { OpenAiClient } from './client.js';

const COMPLETIONS_URL = 'http://127.0.0.1:5001/v1/chat/completions';

const BASE_REQUEST: Omit<ChatCompletionRequest, 'onDelta'> = {
  endpoint: {
    apiKey: null,
    apiKind: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:5001',
    contextSize: null,
    model: 'test-model',
  },
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

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('OpenAiClient request body', () => {
  it('sends the extended sampler set to a local server', async () => {
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () => openAiChatCompletion('раз'));

    await new OpenAiClient({ httpFetch: http.fetch }).completeChat(BASE_REQUEST);

    expect(readProviderChatRequest(http)).toMatchObject({ max_tokens: 128, min_p: 0, rep_pen: 1, top_k: 0 });
  });

  it('drops parameters the OpenAI cloud rejects and sends the reply limit as max_completion_tokens, which gpt-4o accepts too', async () => {
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () => openAiChatCompletion('раз'));

    await new OpenAiClient({ httpFetch: http.fetch }).completeChat({
      ...BASE_REQUEST,
      endpoint: { ...BASE_REQUEST.endpoint, apiKind: 'openai-cloud', model: 'gpt-4o' },
    });

    const body = readProviderChatRequest(http);
    expect(body.max_completion_tokens).toBe(128);
    expect(body.temperature).toBe(1);
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('min_p');
    expect(body).not.toHaveProperty('rep_pen');
    expect(body).not.toHaveProperty('top_k');
  });

  it('leaves samplers alone for reasoning models, which only accept defaults', async () => {
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () => openAiChatCompletion('раз'));

    await new OpenAiClient({ httpFetch: http.fetch }).completeChat({
      ...BASE_REQUEST,
      endpoint: { ...BASE_REQUEST.endpoint, apiKind: 'openai-cloud', model: 'o3-mini' },
    });

    const body = readProviderChatRequest(http);
    expect(body.max_completion_tokens).toBe(128);
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
    expect(body).not.toHaveProperty('presence_penalty');
  });

  it('sends server extensions to a local server only, since the OpenAI cloud rejects unknown fields', async () => {
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () => openAiChatCompletion('раз'));

    await new OpenAiClient({ httpFetch: http.fetch }).completeChat({
      ...BASE_REQUEST,
      serverExtensions: { enable_thinking: false },
    });
    await new OpenAiClient({ httpFetch: http.fetch }).completeChat({
      ...BASE_REQUEST,
      endpoint: { ...BASE_REQUEST.endpoint, apiKind: 'openai-cloud', model: 'gpt-4o' },
      serverExtensions: { enable_thinking: false },
    });

    expect(readProviderChatRequest(http, 0)).toMatchObject({ enable_thinking: false });
    expect(readProviderChatRequest(http, 1)).not.toHaveProperty('enable_thinking');
  });

  it('lets our own fields win over server extensions of the same name', async () => {
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () => openAiChatCompletion('раз'));

    await new OpenAiClient({ httpFetch: http.fetch }).completeChat({
      ...BASE_REQUEST,
      serverExtensions: { max_tokens: 1, model: 'other-model', stream: true, top_k: 99 },
    });

    expect(readProviderChatRequest(http)).toMatchObject({
      max_tokens: 128,
      model: 'test-model',
      stream: false,
      top_k: 0,
    });
  });
});

describe('OpenAiClient replies', () => {
  it('fails an empty reply unless the caller allows it, since thinking can use up the whole limit', async () => {
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () => openAiChatCompletion('<think>Весь лимит ушёл сюда'));
    const client = new OpenAiClient({ httpFetch: http.fetch });

    await expect(client.completeChat(BASE_REQUEST)).rejects.toThrow('Provider returned an empty reply.');
    await expect(client.completeChat({ ...BASE_REQUEST, allowEmptyContent: true })).resolves.toEqual({
      content: '',
      reasoning: 'Весь лимит ушёл сюда',
    });
  });

  it('reports a reply that spent the whole token limit on thinking as hitting the limit, not as empty', async () => {
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () =>
      Response.json({
        choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'Размышляю о глине' } }],
      }),
    );

    const completion = new OpenAiClient({ httpFetch: http.fetch }).completeChat(BASE_REQUEST);

    await expect(completion).rejects.toBeInstanceOf(ProviderReplyTruncatedError);
    await expect(completion).rejects.toThrow('Ответ модели упёрся в лимит токенов');
  });

  it('fails a reply cut off at the token limit only when the caller needs it complete', async () => {
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () => openAiChatCompletion('{"name": "Ари', 'length'));
    const client = new OpenAiClient({ httpFetch: http.fetch });

    await expect(client.completeChat({ ...BASE_REQUEST, requireCompleteReply: true })).rejects.toBeInstanceOf(
      ProviderReplyTruncatedError,
    );

    await expect(client.completeChat(BASE_REQUEST)).resolves.toEqual({ content: '{"name": "Ари', reasoning: '' });
  });

  it('accepts a complete reply when the caller needs it complete', async () => {
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () => openAiChatCompletion('{"name": "Ария"}', 'stop'));

    await expect(
      new OpenAiClient({ httpFetch: http.fetch }).completeChat({ ...BASE_REQUEST, requireCompleteReply: true }),
    ).resolves.toEqual({
      content: '{"name": "Ария"}',
      reasoning: '',
    });
  });

  it('cuts a long provider error body down to its first 500 characters', async () => {
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () => new Response('x'.repeat(2000), { status: 500 }));

    await expect(new OpenAiClient({ httpFetch: http.fetch }).completeChat(BASE_REQUEST)).rejects.toThrow(
      /^Provider returned HTTP 500: x{500}$/u,
    );
  });
});

describe('OpenAiClient streaming', () => {
  it('reports every chunk in order and returns the joined reply', async () => {
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () =>
      openAiChatStream([{ content: 'Прив' }, { content: 'ет, ' }, { content: 'мир.' }]),
    );
    const deltas: string[] = [];
    const client = new OpenAiClient({ httpFetch: http.fetch });

    const response = await client.completeChat({ ...BASE_REQUEST, onDelta: (delta) => deltas.push(delta) });

    expect(deltas).toEqual(['Прив', 'ет, ', 'мир.']);
    expect(response.content).toBe('Привет, мир.');
  });

  it('asks for a stream only when a delta callback is given', async () => {
    const http = createHttpStub();
    http.once('POST', COMPLETIONS_URL, () => openAiChatStream([{ content: 'раз' }]));
    http.once('POST', COMPLETIONS_URL, () => openAiChatCompletion('раз'));
    const client = new OpenAiClient({ httpFetch: http.fetch });

    await client.completeChat({ ...BASE_REQUEST, onDelta: () => undefined });
    await client.completeChat(BASE_REQUEST);

    expect(readProviderChatRequest(http, 0).stream).toBe(true);
    expect(readProviderChatRequest(http, 1).stream).toBe(false);
  });

  it('falls back to the plain response when the server answers a stream request with JSON, going by content-type', async () => {
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () => openAiChatCompletion('Целый ответ.'));
    const deltas: string[] = [];
    const client = new OpenAiClient({ httpFetch: http.fetch });

    const response = await client.completeChat({ ...BASE_REQUEST, onDelta: (delta) => deltas.push(delta) });

    expect(deltas).toEqual([]);
    expect(response.content).toBe('Целый ответ.');
  });

  it('survives a chunk split across two reads of the stream', async () => {
    const chunk = `data: ${JSON.stringify({ choices: [{ delta: { content: 'склеено' } }] })}\n\n`;
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () =>
      eventStreamResponse(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encode(chunk.slice(0, 20)));
            controller.enqueue(encode(chunk.slice(20)));
            controller.enqueue(encode('data: [DONE]\n\n'));
            controller.close();
          },
        }),
      ),
    );

    const deltas: string[] = [];
    const client = new OpenAiClient({ httpFetch: http.fetch });
    const response = await client.completeChat({ ...BASE_REQUEST, onDelta: (delta) => deltas.push(delta) });

    expect(deltas).toEqual(['склеено']);
    expect(response.content).toBe('склеено');
  });

  it('fails on an in-band error chunk instead of returning the reply streamed so far', async () => {
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () =>
      eventStream([
        JSON.stringify({ choices: [{ delta: { content: 'Half a rep' } }] }),
        JSON.stringify({ error: { message: 'CUDA error: out of memory', type: 'server_error' } }),
        '[DONE]',
      ]),
    );
    const deltas: string[] = [];

    const completion = new OpenAiClient({ httpFetch: http.fetch }).completeChat({
      ...BASE_REQUEST,
      onDelta: (delta) => deltas.push(delta),
    });

    await expect(completion).rejects.toBeInstanceOf(ProviderGenerationError);
    await expect(completion).rejects.toThrow(/CUDA error: out of memory/u);
    expect(deltas).toEqual(['Half a rep']);
  });

  it('cancels the provider stream when a chunk fails, so the server stops generating', async () => {
    let canceled = false;
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () =>
      eventStreamResponse(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encode(`data: ${JSON.stringify({ error: 'out of memory' })}\n\n`));
          },
          cancel() {
            canceled = true;
          },
        }),
      ),
    );

    await expect(
      new OpenAiClient({ httpFetch: http.fetch }).completeChat({ ...BASE_REQUEST, onDelta: () => undefined }),
    ).rejects.toThrow(/out of memory/u);
    expect(canceled).toBe(true);
  });

  it('reports the provider error even when cancelling the stream fails as well', async () => {
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () =>
      eventStreamResponse(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encode(`data: ${JSON.stringify({ error: 'out of memory' })}\n\n`));
          },
          cancel() {
            throw new Error('cancel failed');
          },
        }),
      ),
    );

    await expect(
      new OpenAiClient({ httpFetch: http.fetch }).completeChat({ ...BASE_REQUEST, onDelta: () => undefined }),
    ).rejects.toThrow(/out of memory/u);
  });

  it('reads the token-limit finish reason from the final stream chunk', async () => {
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () =>
      eventStream([
        JSON.stringify({ choices: [{ delta: { reasoning_content: 'Размышляю' }, finish_reason: null }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] }),
        '[DONE]',
      ]),
    );

    await expect(
      new OpenAiClient({ httpFetch: http.fetch }).completeChat({ ...BASE_REQUEST, onDelta: () => undefined }),
    ).rejects.toBeInstanceOf(ProviderReplyTruncatedError);
  });

  it('fails on an in-band error given as a bare string', async () => {
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () => eventStream([JSON.stringify({ error: 'upstream closed the connection' })]));

    await expect(
      new OpenAiClient({ httpFetch: http.fetch }).completeChat({ ...BASE_REQUEST, onDelta: () => undefined }),
    ).rejects.toThrow(/upstream closed the connection/u);
  });

  it('streams the separate reasoning fields of DeepSeek-style servers straight to the reasoning channel', async () => {
    const http = createHttpStub();
    http.on('POST', COMPLETIONS_URL, () =>
      openAiChatStream([{ reasoning_content: 'Ду' }, { reasoning: 'маю' }, { content: 'Ответ.' }]),
    );
    const deltas: Array<[string, string]> = [];

    const response = await new OpenAiClient({ httpFetch: http.fetch }).completeChat({
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

  it('hands the caller signal to the HTTP port, so cancelling a generation stops the provider request', async () => {
    const http = createHttpStub();
    const held = http.hold('POST', COMPLETIONS_URL);
    const controller = new AbortController();

    const completion = new OpenAiClient({ httpFetch: http.fetch }).completeChat({
      ...BASE_REQUEST,
      onDelta: () => undefined,
      signal: controller.signal,
    });
    const sent = await held.started;
    controller.abort();

    expect(sent.signal?.aborted).toBe(true);
    await expect(completion).rejects.toMatchObject({ name: 'AbortError' });
  });

  it.each([
    ['JSON reply', 'application/json', '{"choices":', false],
    ['streamed reply', 'text/event-stream', 'data: {"choices":[{"delta":{"content":"Пе"}}]}\n\n', true],
  ])('rethrows the caller abort itself, not a provider failure, when it cuts the %s short', async (_name, contentType, firstChunk, streamed) => {
    const http = createHttpStub();
    const controller = new AbortController();
    const replyStarted = createDeferred();
    http.on('POST', COMPLETIONS_URL, (request) => {
      replyStarted.resolve();

      return bodyHeldUntilAborted(request.signal, contentType, firstChunk);
    });

    const completion = new OpenAiClient({ httpFetch: http.fetch }).completeChat({
      ...BASE_REQUEST,
      ...(streamed ? { onDelta: () => undefined } : {}),
      signal: controller.signal,
    });
    await replyStarted.promise;
    controller.abort(new DOMException('Клиент ушёл.', 'AbortError'));

    await expect(completion).rejects.toBe(controller.signal.reason);
  });
});
