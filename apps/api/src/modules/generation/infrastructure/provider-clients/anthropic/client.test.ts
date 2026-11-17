import { describe, expect, it } from 'vitest';

import { createCapturingLogger } from '../../../../../test-support/capturing-logger.js';
import { createDeferred } from '../../../../../test-support/deferred.js';
import { createHttpStub } from '../../../../../test-support/http-stub.js';
import { readProviderChatRequest } from '../../../../../test-support/provider-chat-request.js';
import {
  anthropicMessage,
  anthropicMessageStream,
  bodyHeldUntilAborted,
} from '../../../../../test-support/provider-responses.js';
import type { ChatCompletionRequest } from '../../../application/chat-completion-client.js';
import { AnthropicClient } from './client.js';
import {
  ANTHROPIC_FALLBACK_MAX_OUTPUT_TOKENS,
  ANTHROPIC_OUTPUT_CAP_FALLBACK_LOG_MESSAGE,
} from './model-output-limit.js';
import { buildAnthropicPayload } from './request.js';

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const MODEL_URL = 'https://api.anthropic.com/v1/models/claude-sonnet-4-5';

const BASE_REQUEST: Omit<ChatCompletionRequest, 'onDelta'> = {
  endpoint: {
    apiKey: 'sk-ant-test',
    apiKind: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    contextSize: null,
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
    const http = createHttpStub();
    http.on('POST', MESSAGES_URL, () => anthropicMessage('Здравствуй.'));

    const response = await new AnthropicClient({
      httpFetch: http.fetch,
      logger: createCapturingLogger().logger,
    }).completeChat(BASE_REQUEST);

    expect(http.requestLines()).toEqual([`POST ${MESSAGES_URL}`]);
    expect(http.requests[0]?.headers.get('x-api-key')).toBe('sk-ant-test');
    expect(http.requests[0]?.headers.get('anthropic-version')).toBe('2023-06-01');
    expect(readProviderChatRequest(http).system).toBe('Ты — рассказчик.');
    expect(response.content).toBe('Здравствуй.');
  });

  it('clamps temperature to 1 and drops repetition penalties, which the Anthropic API does not accept', async () => {
    const http = createHttpStub();
    http.on('POST', MESSAGES_URL, () => anthropicMessage('Ага.'));

    await new AnthropicClient({ httpFetch: http.fetch, logger: createCapturingLogger().logger }).completeChat(
      BASE_REQUEST,
    );
    const body = readProviderChatRequest(http);

    expect(body.temperature).toBe(1);
    expect(body.top_k).toBe(40);
    expect(body).not.toHaveProperty('presence_penalty');
    expect(body).not.toHaveProperty('rep_pen');
    expect(body).not.toHaveProperty('min_p');
  });

  it('sends Claude either temperature or top_p, since newer Claude models reject both together', async () => {
    const http = createHttpStub();
    http.on('POST', MESSAGES_URL, () => anthropicMessage('Ага.'));

    await new AnthropicClient({ httpFetch: http.fetch, logger: createCapturingLogger().logger }).completeChat({
      ...BASE_REQUEST,
      sampling: { ...BASE_REQUEST.sampling, temperature: 0.7, topP: 0.9 },
    });
    const body = readProviderChatRequest(http);

    expect(body.temperature).toBe(0.7);
    expect(body).not.toHaveProperty('top_p');
  });

  it('sends no sampling parameters to a Claude model that rejects them all, such as Opus 5', async () => {
    const http = createHttpStub();
    http.on('POST', MESSAGES_URL, () => anthropicMessage('Ага.'));

    await new AnthropicClient({ httpFetch: http.fetch, logger: createCapturingLogger().logger }).completeChat({
      ...BASE_REQUEST,
      endpoint: { ...BASE_REQUEST.endpoint, model: 'claude-opus-5' },
    });
    const body = readProviderChatRequest(http);

    expect(body.model).toBe('claude-opus-5');
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
    expect(body).not.toHaveProperty('top_k');
  });

  it('keeps thinking blocks out of the reply', async () => {
    const http = createHttpStub();
    http.on('POST', MESSAGES_URL, () =>
      Response.json({
        content: [
          { thinking: 'Взвешиваю варианты.', type: 'thinking' },
          { text: 'Ответ.', type: 'text' },
        ],
      }),
    );

    const response = await new AnthropicClient({
      httpFetch: http.fetch,
      logger: createCapturingLogger().logger,
    }).completeChat(BASE_REQUEST);

    expect(response.content).toBe('Ответ.');
    expect(response.reasoning).toBe('Взвешиваю варианты.');
  });

  it('passes over content blocks of unknown types, such as tool_use and redacted_thinking, without failing', async () => {
    const http = createHttpStub();
    http.on('POST', MESSAGES_URL, () =>
      Response.json({
        content: [
          { data: 'opaque', type: 'redacted_thinking' },
          { id: 'toolu_1', input: {}, name: 'search', type: 'tool_use' },
          { text: 'Ответ.', type: 'text' },
        ],
      }),
    );

    const response = await new AnthropicClient({
      httpFetch: http.fetch,
      logger: createCapturingLogger().logger,
    }).completeChat(BASE_REQUEST);

    expect(response).toEqual({ content: 'Ответ.', reasoning: '', stoppedAtTokenLimit: false });
  });

  it('never forwards server extensions, which the Anthropic API would reject', async () => {
    const http = createHttpStub();
    http.on('POST', MESSAGES_URL, () => anthropicMessage('Ага.'));

    await new AnthropicClient({ httpFetch: http.fetch, logger: createCapturingLogger().logger }).completeChat({
      ...BASE_REQUEST,
      serverExtensions: { enable_thinking: false },
    });

    expect(readProviderChatRequest(http)).not.toHaveProperty('enable_thinking');
  });

  it('reports streamed text and thinking on their own channels', async () => {
    const http = createHttpStub();
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

    const response = await new AnthropicClient({
      httpFetch: http.fetch,
      logger: createCapturingLogger().logger,
    }).completeChat({
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
    const http = createHttpStub();
    http.on('POST', MESSAGES_URL, () =>
      anthropicMessageStream([
        { delta: { text: '<think>Прикидываю</think>', type: 'text_delta' }, type: 'content_block_delta' },
        { delta: { text: 'Ответ.', type: 'text_delta' }, type: 'content_block_delta' },
        { type: 'message_stop' },
      ]),
    );
    const deltas: Array<[string, string]> = [];

    const response = await new AnthropicClient({
      httpFetch: http.fetch,
      logger: createCapturingLogger().logger,
    }).completeChat({
      ...BASE_REQUEST,
      onDelta: (delta, channel) => deltas.push([channel, delta]),
    });

    expect(deltas).toEqual([
      ['reasoning', 'Прикидываю'],
      ['reply', 'Ответ.'],
    ]);
    expect(response).toEqual({ content: 'Ответ.', reasoning: 'Прикидываю', stoppedAtTokenLimit: false });
  });

  it('fails loudly when the stream reports an error event', async () => {
    const http = createHttpStub();
    http.on('POST', MESSAGES_URL, () =>
      anthropicMessageStream([{ error: { message: 'overloaded_error' }, type: 'error' }]),
    );

    await expect(
      new AnthropicClient({ httpFetch: http.fetch, logger: createCapturingLogger().logger }).completeChat({
        ...BASE_REQUEST,
        onDelta: () => undefined,
      }),
    ).rejects.toThrow(/overloaded_error/u);
  });

  it('hands the caller signal to the HTTP port, so cancelling a generation stops the provider request', async () => {
    const http = createHttpStub();
    const held = http.hold('POST', MESSAGES_URL);
    const controller = new AbortController();

    const completion = new AnthropicClient({
      httpFetch: http.fetch,
      logger: createCapturingLogger().logger,
    }).completeChat({
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
    ['JSON reply', 'application/json', '{"content":', false],
    ['streamed reply', 'text/event-stream', 'event: message_start\ndata: {"type":"message_start"}\n\n', true],
  ])('rethrows the caller abort itself, not a provider failure, when it cuts the %s short', async (_name, contentType, firstChunk, streamed) => {
    const http = createHttpStub();
    const controller = new AbortController();
    const replyStarted = createDeferred();
    http.on('POST', MESSAGES_URL, (request) => {
      replyStarted.resolve();

      return bodyHeldUntilAborted(request.signal, contentType, firstChunk);
    });

    const completion = new AnthropicClient({
      httpFetch: http.fetch,
      logger: createCapturingLogger().logger,
    }).completeChat({
      ...BASE_REQUEST,
      ...(streamed ? { onDelta: () => undefined } : {}),
      signal: controller.signal,
    });
    await replyStarted.promise;
    controller.abort(new DOMException('Клиент ушёл.', 'AbortError'));

    await expect(completion).rejects.toBe(controller.signal.reason);
  });
});

describe('AnthropicClient reply limit', () => {
  it('Anthropic requires max_tokens, so an unlimited reply asks for the output cap the Models API reports as max_tokens', async () => {
    const http = createHttpStub();
    http.on('GET', MODEL_URL, () =>
      Response.json({
        created_at: '2025-09-29T00:00:00Z',
        display_name: 'Claude Sonnet 4.5',
        id: 'claude-sonnet-4-5',
        max_input_tokens: 1_000_000,
        max_tokens: 64_000,
        type: 'model',
      }),
    );
    http.on('POST', MESSAGES_URL, () => anthropicMessage('Ответ.'));
    const client = new AnthropicClient({ httpFetch: http.fetch, logger: createCapturingLogger().logger });

    await client.completeChat({ ...BASE_REQUEST, maxTokens: null });
    await client.completeChat({ ...BASE_REQUEST, maxTokens: null });

    expect(http.requestLines()).toEqual([`GET ${MODEL_URL}`, `POST ${MESSAGES_URL}`, `POST ${MESSAGES_URL}`]);
    expect(http.requests[0]?.headers.get('x-api-key')).toBe('sk-ant-test');
    expect(http.fetch.mock.calls[0]?.[1].redirect).toBe('manual');
    expect(readProviderChatRequest(http, 1).max_tokens).toBe(64_000);
    expect(readProviderChatRequest(http, 2).max_tokens).toBe(64_000);
  });

  it('falls back to a 4096-token cap when the Models API cannot tell it, such as a proxy without /v1/models', async () => {
    const http = createHttpStub();
    http.on('GET', MODEL_URL, () => new Response('not found', { status: 404 }));
    http.on('POST', MESSAGES_URL, () => anthropicMessage('Ответ.'));
    const capture = createCapturingLogger();

    await new AnthropicClient({ httpFetch: http.fetch, logger: capture.logger }).completeChat({
      ...BASE_REQUEST,
      maxTokens: null,
    });

    expect(capture.lines).toContainEqual(
      expect.objectContaining({
        fallbackMaxTokens: 4096,
        model: 'claude-sonnet-4-5',
        msg: ANTHROPIC_OUTPUT_CAP_FALLBACK_LOG_MESSAGE,
        status: 404,
      }),
    );

    expect(ANTHROPIC_FALLBACK_MAX_OUTPUT_TOKENS).toBe(4096);
    expect(readProviderChatRequest(http, 1).max_tokens).toBe(ANTHROPIC_FALLBACK_MAX_OUTPUT_TOKENS);
  });

  it('does not follow a redirect of the model lookup, which would carry the key elsewhere, and falls back instead', async () => {
    const http = createHttpStub();
    http.on(
      'GET',
      MODEL_URL,
      () => new Response(null, { headers: { Location: 'https://elsewhere.test/' }, status: 302 }),
    );
    http.on('POST', MESSAGES_URL, () => anthropicMessage('Ответ.'));
    const capture = createCapturingLogger();

    await new AnthropicClient({ httpFetch: http.fetch, logger: capture.logger }).completeChat({
      ...BASE_REQUEST,
      maxTokens: null,
    });

    expect(http.requestLines()).toEqual([`GET ${MODEL_URL}`, `POST ${MESSAGES_URL}`]);
    expect(readProviderChatRequest(http, 1).max_tokens).toBe(ANTHROPIC_FALLBACK_MAX_OUTPUT_TOKENS);
    expect(capture.lines).toContainEqual(
      expect.objectContaining({
        err: expect.objectContaining({ type: 'RedirectRefusedError' }),
        msg: ANTHROPIC_OUTPUT_CAP_FALLBACK_LOG_MESSAGE,
      }),
    );
  });

  it('falls back when the model info carries no max_tokens, and asks again next time', async () => {
    const http = createHttpStub();
    http.on('GET', MODEL_URL, () => Response.json({ id: 'claude-sonnet-4-5', type: 'model' }));
    http.on('POST', MESSAGES_URL, () => anthropicMessage('Ответ.'));
    const client = new AnthropicClient({ httpFetch: http.fetch, logger: createCapturingLogger().logger });

    await client.completeChat({ ...BASE_REQUEST, maxTokens: null });
    await client.completeChat({ ...BASE_REQUEST, maxTokens: null });

    expect(http.requestLines().filter((line) => line.startsWith('GET'))).toHaveLength(2);
    expect(readProviderChatRequest(http, 1).max_tokens).toBe(ANTHROPIC_FALLBACK_MAX_OUTPUT_TOKENS);
  });

  it('sends an explicit reply limit as is, without asking the Models API', async () => {
    const http = createHttpStub();
    http.on('POST', MESSAGES_URL, () => anthropicMessage('Ответ.'));

    await new AnthropicClient({ httpFetch: http.fetch, logger: createCapturingLogger().logger }).completeChat(
      BASE_REQUEST,
    );

    expect(http.requestLines()).toEqual([`POST ${MESSAGES_URL}`]);
    expect(readProviderChatRequest(http).max_tokens).toBe(256);
  });

  it.each([
    'max_tokens',
    'model_context_window_exceeded',
  ])('reports a reply that stopped with stop_reason %s as cut at the token limit', async (stopReason) => {
    const http = createHttpStub();
    http.on('POST', MESSAGES_URL, () =>
      Response.json({ content: [{ text: 'Оборван', type: 'text' }], stop_reason: stopReason }),
    );

    const response = await new AnthropicClient({
      httpFetch: http.fetch,
      logger: createCapturingLogger().logger,
    }).completeChat(BASE_REQUEST);

    expect(response).toEqual({ content: 'Оборван', reasoning: '', stoppedAtTokenLimit: true });
  });

  it('reports a streamed reply whose message_delta says max_tokens as cut at the token limit', async () => {
    const http = createHttpStub();
    http.on('POST', MESSAGES_URL, () =>
      anthropicMessageStream([
        { delta: { text: 'Оборв', type: 'text_delta' }, index: 0, type: 'content_block_delta' },
        {
          delta: { stop_reason: 'max_tokens', stop_sequence: null },
          type: 'message_delta',
          usage: { output_tokens: 5 },
        },
        { type: 'message_stop' },
      ]),
    );

    const response = await new AnthropicClient({
      httpFetch: http.fetch,
      logger: createCapturingLogger().logger,
    }).completeChat({
      ...BASE_REQUEST,
      onDelta: () => undefined,
    });

    expect(response).toEqual({ content: 'Оборв', reasoning: '', stoppedAtTokenLimit: true });
  });

  it('reports a reply that ended on its own as complete', async () => {
    const http = createHttpStub();
    http.on('POST', MESSAGES_URL, () =>
      Response.json({ content: [{ text: 'Готово.', type: 'text' }], stop_reason: 'end_turn' }),
    );

    const response = await new AnthropicClient({
      httpFetch: http.fetch,
      logger: createCapturingLogger().logger,
    }).completeChat(BASE_REQUEST);

    expect(response.stoppedAtTokenLimit).toBe(false);
  });
});
