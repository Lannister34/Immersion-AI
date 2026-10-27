import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';

import { beforeEach, describe, expect, it } from 'vitest';

import { CLIENT_DISCONNECT_LOG_MESSAGE, clientDisconnectOutcome } from './test-support/client-disconnect-outcome.js';
import { createDeferred } from './test-support/deferred.js';
import { FakeChatCompletionClient } from './test-support/fake-chat-completion-client.js';
import type { HttpResponder } from './test-support/http-stub.js';
import { openSocketRequest } from './test-support/open-socket-request.js';
import {
  OpenAiChatCompletionChunkFixtureSchema,
  OpenAiChatCompletionFixtureSchema,
  OpenAiErrorFixtureSchema,
  OpenAiModelListFixtureSchema,
} from './test-support/openai-response-fixture-schemas.js';
import { readProviderChatRequest } from './test-support/provider-chat-request.js';
import {
  anthropicMessage,
  bodyHeldUntilAborted,
  eventStream,
  openAiChatCompletion,
  openAiChatStream,
} from './test-support/provider-responses.js';
import { createServerSentEventDataDecoder } from './test-support/server-sent-event-data.js';
import { requestOverSocket } from './test-support/socket-request.js';
import { createTestApi } from './test-support/test-api.js';
import { useTestApi } from './test-support/use-test-api.js';

const PROVIDER_URL = 'http://127.0.0.1:6007';
const CHAT_COMPLETIONS_URL = `${PROVIDER_URL}/v1/chat/completions`;
const MODELS_URL = `${PROVIDER_URL}/v1/models`;

function dataLinesOf(body: string) {
  const decoder = createServerSentEventDataDecoder();
  const lines = decoder.push(body);
  decoder.end();

  return lines;
}

function chunksOf(body: string) {
  return dataLinesOf(body)
    .filter((line) => line !== '[DONE]')
    .map((line) => OpenAiChatCompletionChunkFixtureSchema.parse(JSON.parse(line)));
}

describe('OpenAI-compatible endpoint', () => {
  const api = useTestApi({ fixture: 'smoke' });

  beforeEach(async () => {
    await api().settings.patch({
      activeProvider: 'custom',
      backendMode: 'external',
      providerConfigs: { custom: { model: 'fixture-model', url: PROVIDER_URL } },
    });
  });

  function answerWith(respond: HttpResponder) {
    api().http.on('POST', CHAT_COMPLETIONS_URL, respond);
  }

  function sentMessages(index = 0) {
    return readProviderChatRequest(api().http, index).messages;
  }

  it('answers a plain chat completion in the OpenAI response shape', async () => {
    answerWith(() => openAiChatCompletion('Привет из Immersion.'));

    const response = await api().app.inject({
      method: 'POST',
      payload: {
        messages: [
          { content: 'Ты — краткий помощник.', role: 'system' },
          { content: 'Скажи привет.', role: 'user' },
        ],
        model: 'immersion',
      },
      url: '/v1/chat/completions',
    });
    const payload = OpenAiChatCompletionFixtureSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.object).toBe('chat.completion');
    expect(payload.choices[0].message).toMatchObject({ content: 'Привет из Immersion.', role: 'assistant' });
    expect(payload.choices[0].finish_reason).toBe('stop');
    expect(payload.model).toBe('fixture-model');
    expect(payload.usage.total_tokens).toBe(payload.usage.prompt_tokens + payload.usage.completion_tokens);
    expect(payload.usage.prompt_tokens).toBeGreaterThan(0);

    expect(sentMessages().map((message) => message.role)).toEqual(['system', 'user']);
    expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
  });

  it('keeps no history: the dialogue comes in the request and no file is created', async () => {
    answerWith(() => openAiChatCompletion('ок'));
    const filesBefore = (await fs.readdir(api().dataRoot, { recursive: true })).sort();
    const dialogue = [
      { content: 'Раньше.', role: 'user' },
      { content: 'Было.', role: 'assistant' },
      { content: 'Теперь?', role: 'user' },
    ];

    const response = await api().app.inject({
      method: 'POST',
      payload: { messages: dialogue },
      url: '/v1/chat/completions',
    });

    expect(response.statusCode).toBe(200);
    expect(sentMessages()).toEqual(dialogue);
    expect((await fs.readdir(api().dataRoot, { recursive: true })).sort()).toEqual(filesBefore);
  });

  it('answers through Anthropic when it is the active provider', async () => {
    await api().settings.patch({
      activeProvider: 'anthropic',
      providerConfigs: {
        anthropic: { apiKey: 'sk-ant-test', model: 'claude-sonnet-4-5', url: 'https://api.anthropic.com/v1' },
      },
    });
    api().http.on('POST', 'https://api.anthropic.com/v1/messages', () => anthropicMessage('Привет от Claude.'));

    const response = await api().app.inject({
      method: 'POST',
      payload: {
        messages: [
          { content: 'Ты — краткий помощник.', role: 'system' },
          { content: 'Скажи привет.', role: 'user' },
        ],
        model: 'immersion',
      },
      url: '/v1/chat/completions',
    });

    expect(api().http.requestLines()).toEqual(['POST https://api.anthropic.com/v1/messages']);
    expect(readProviderChatRequest(api().http)).toMatchObject({
      model: 'claude-sonnet-4-5',
      system: 'Ты — краткий помощник.',
    });
    expect(OpenAiChatCompletionFixtureSchema.parse(response.json()).choices[0].message.content).toBe(
      'Привет от Claude.',
    );
  });

  it('refuses a cloud provider without a model with the message readiness reports', async () => {
    await api().settings.patch({
      activeProvider: 'openai',
      providerConfigs: { openai: { apiKey: 'sk-test', url: 'https://api.openai.com/v1' } },
    });
    answerWith(() => openAiChatCompletion('ок'));

    const response = await api().app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }] },
      url: '/v1/chat/completions',
    });

    expect(response.statusCode).toBe(503);
    expect(OpenAiErrorFixtureSchema.parse(response.json()).error).toMatchObject({
      code: 'provider_unavailable',
      message: 'Модель провайдера не выбрана. Выберите её на странице API.',
      type: 'server_error',
    });
    expect(api().http.requestLines()).toEqual([]);
  });

  it('fills usage with an estimate rather than zeros when tokens cannot be counted exactly', async () => {
    answerWith(() => openAiChatCompletion('Короткий ответ.'));

    const response = await api().app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Посчитай меня.', role: 'user' }] },
      url: '/v1/chat/completions',
    });
    const { usage } = OpenAiChatCompletionFixtureSchema.parse(response.json());

    expect(usage.prompt_tokens).toBeGreaterThan(0);
    expect(usage.completion_tokens).toBeGreaterThan(0);
  });

  it('applies the sampler preset and lets the request override temperature', async () => {
    answerWith(() => openAiChatCompletion('ок'));
    const activePreset = await api().settings.samplerPreset('default');

    await api().app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }], temperature: 0.1 },
      url: '/v1/chat/completions',
    });

    expect(readProviderChatRequest(api().http)).toMatchObject({
      min_p: activePreset.min_p,
      rep_pen: activePreset.rep_pen,
      temperature: 0.1,
    });
  });

  it('passes the requested model through to the provider', async () => {
    answerWith(() => openAiChatCompletion('ок'));

    const response = await api().app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }], model: 'some-other-model' },
      url: '/v1/chat/completions',
    });

    expect(readProviderChatRequest(api().http).model).toBe('some-other-model');
    expect(OpenAiChatCompletionFixtureSchema.parse(response.json()).model).toBe('some-other-model');
  });

  it('forwards image parts of a multimodal message', async () => {
    answerWith(() => openAiChatCompletion('вижу'));

    await api().app.inject({
      method: 'POST',
      payload: {
        messages: [
          {
            content: [
              { text: 'Что на картинке?', type: 'text' },
              { image_url: { url: 'data:image/png;base64,AAAB' }, type: 'image_url' },
            ],
            role: 'user',
          },
        ],
      },
      url: '/v1/chat/completions',
    });

    expect(sentMessages()[0]?.content).toEqual([
      { text: 'Что на картинке?', type: 'text' },
      { image_url: { url: 'data:image/png;base64,AAAB' }, type: 'image_url' },
    ]);
  });

  it('skips content parts of unknown types instead of rejecting the request', async () => {
    answerWith(() => openAiChatCompletion('ок'));

    const response = await api().app.inject({
      method: 'POST',
      payload: {
        messages: [
          {
            content: [
              { text: 'Что тут?', type: 'text' },
              { input_audio: { data: 'AAAA', format: 'wav' }, type: 'input_audio' },
            ],
            role: 'user',
          },
        ],
      },
      url: '/v1/chat/completions',
    });

    expect(response.statusCode).toBe(200);
    expect(sentMessages()).toEqual([{ content: 'Что тут?', role: 'user' }]);
  });

  it('treats the developer role as system and rejects tool and function roles', async () => {
    answerWith(() => openAiChatCompletion('ок'));

    await api().app.inject({
      method: 'POST',
      payload: {
        messages: [
          { content: 'Правила.', role: 'developer' },
          { content: 'Привет.', role: 'user' },
        ],
      },
      url: '/v1/chat/completions',
    });

    expect(sentMessages().map((message) => message.role)).toEqual(['system', 'user']);

    for (const role of ['tool', 'function']) {
      const response = await api().app.inject({
        method: 'POST',
        payload: {
          messages: [
            { content: 'Привет.', role: 'user' },
            { content: '42', role },
          ],
        },
        url: '/v1/chat/completions',
      });

      expect(response.statusCode).toBe(400);
    }

    expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
  });

  it('drops empty messages before they reach the provider', async () => {
    answerWith(() => openAiChatCompletion('ок'));

    await api().app.inject({
      method: 'POST',
      payload: {
        messages: [
          { content: '', role: 'system' },
          { content: '   ', role: 'assistant' },
          { content: 'Привет.', role: 'user' },
        ],
      },
      url: '/v1/chat/completions',
    });

    expect(sentMessages()).toEqual([{ content: 'Привет.', role: 'user' }]);
  });

  it('streams chunks and closes the stream with [DONE]', async () => {
    answerWith(() => openAiChatStream([{ content: 'При' }, { content: 'вет.' }]));

    const response = await api().app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }], stream: true },
      url: '/v1/chat/completions',
    });
    const chunks = chunksOf(response.body);

    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(dataLinesOf(response.body).at(-1)).toBe('[DONE]');
    expect(chunks[0]?.choices[0].delta.role).toBe('assistant');
    expect(chunks.map((chunk) => chunk.choices[0].delta.content ?? '').join('')).toBe('Привет.');
    expect(chunks.at(-1)?.choices[0].finish_reason).toBe('stop');
    expect(chunks.every((chunk) => chunk.object === 'chat.completion.chunk')).toBe(true);
  });

  it('ends a stream that produced only reasoning with finish_reason length, as the plain reply does', async () => {
    answerWith(() => openAiChatStream([{ reasoning_content: 'Всё ушло ' }, { reasoning_content: 'сюда' }]));

    const response = await api().app.inject({
      method: 'POST',
      payload: { max_tokens: 8, messages: [{ content: 'Привет.', role: 'user' }], stream: true },
      url: '/v1/chat/completions',
    });
    const chunks = chunksOf(response.body);

    expect(chunks.map((chunk) => chunk.choices[0].delta.reasoning_content ?? '').join('')).toBe('Всё ушло сюда');
    expect(chunks.map((chunk) => chunk.choices[0].delta.content ?? '').join('')).toBe('');
    expect(chunks.at(-1)?.choices[0].finish_reason).toBe('length');
  });

  it('streams the reasoning of a provider that answered the stream request with plain JSON', async () => {
    answerWith(() => openAiChatCompletion('<think>Взвешиваю</think>Ответ.'));

    const response = await api().app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }], stream: true },
      url: '/v1/chat/completions',
    });
    const deltas = chunksOf(response.body).map((chunk) => chunk.choices[0].delta);

    expect(deltas).toEqual([
      { content: '', role: 'assistant' },
      { reasoning_content: 'Взвешиваю' },
      { content: 'Ответ.' },
      {},
    ]);
  });

  it('names the resolved model in every streamed chunk, as the plain reply does', async () => {
    answerWith(() => openAiChatStream([{ content: 'Привет.' }]));

    const response = await api().app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }], model: 'immersion', stream: true },
      url: '/v1/chat/completions',
    });
    const models = chunksOf(response.body).map((chunk) => chunk.model);

    expect(models.length).toBeGreaterThan(0);
    expect(new Set(models)).toEqual(new Set(['fixture-model']));
  });

  it('streams a single chunk when the provider answers without streaming', async () => {
    answerWith(() => openAiChatCompletion('Целиком.'));

    const response = await api().app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }], stream: true },
      url: '/v1/chat/completions',
    });
    const contents = chunksOf(response.body).map((chunk) => chunk.choices[0].delta.content ?? '');

    expect(contents.join('')).toBe('Целиком.');
  });

  it('answers a provider failure before the first chunk with a plain JSON error, not a broken stream', async () => {
    answerWith(() => new Response('upstream down', { status: 500 }));

    const response = await api().app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }], stream: true },
      url: '/v1/chat/completions',
    });

    expect(response.statusCode).toBe(502);
    expect(response.headers['content-type']).toContain('application/json');
    expect(OpenAiErrorFixtureSchema.parse(response.json()).error).toMatchObject({
      code: 'provider_failed',
      type: 'upstream_error',
    });
  });

  it('reports a provider failure inside the stream once the stream has started', async () => {
    answerWith(() => eventStream([JSON.stringify({ choices: [{ delta: { content: 'Нача' } }] }), '{oops']));

    const response = await api().app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }], stream: true },
      url: '/v1/chat/completions',
    });
    const lines = dataLinesOf(response.body);

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(lines.at(-1)).toBe('[DONE]');
    expect(OpenAiErrorFixtureSchema.parse(JSON.parse(lines.at(-2) ?? '{}')).error).toMatchObject({
      code: 'provider_failed',
      type: 'upstream_error',
    });
  });

  it('reports reasoning on its own field instead of mixing it into the reply', async () => {
    answerWith(() => openAiChatCompletion('<think>Взвешиваю</think>Ответ.'));

    const response = await api().app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }] },
      url: '/v1/chat/completions',
    });
    const { message } = OpenAiChatCompletionFixtureSchema.parse(response.json()).choices[0];

    expect(message.content).toBe('Ответ.');
    expect(message.reasoning_content).toBe('Взвешиваю');
  });

  it('forwards server extensions to a local provider, such as the enable_thinking: false that stops Qwen3 spending the limit on thinking', async () => {
    answerWith(() => openAiChatCompletion('ок'));

    await api().app.inject({
      method: 'POST',
      payload: {
        chat_template_kwargs: { enable_thinking: false },
        enable_thinking: false,
        messages: [{ content: 'Привет.', role: 'user' }],
        seed: 42,
        stop: ['<<STOP>>'],
      },
      url: '/v1/chat/completions',
    });

    expect(readProviderChatRequest(api().http)).toMatchObject({
      chat_template_kwargs: { enable_thinking: false },
      enable_thinking: false,
      messages: [{ content: 'Привет.', role: 'user' }],
      seed: 42,
      stop: ['<<STOP>>'],
    });
  });

  it('answers with finish_reason length instead of failing when thinking ate the budget', async () => {
    answerWith(() => openAiChatCompletion('<think>Всё ушло сюда'));

    const response = await api().app.inject({
      method: 'POST',
      payload: { max_tokens: 8, messages: [{ content: 'Привет.', role: 'user' }] },
      url: '/v1/chat/completions',
    });
    const [choice] = OpenAiChatCompletionFixtureSchema.parse(response.json()).choices;

    expect(response.statusCode).toBe(200);
    expect(choice.finish_reason).toBe('length');
    expect(choice.message.content).toBe('');
    expect(choice.message.reasoning_content).toBe('Всё ушло сюда');
  });

  it('rejects what it cannot honour with an OpenAI-shaped error instead of answering something else', async () => {
    answerWith(() => openAiChatCompletion('ок'));

    const manyChoices = await api().app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }], n: 3 },
      url: '/v1/chat/completions',
    });
    expect(manyChoices.statusCode).toBe(400);
    expect(OpenAiErrorFixtureSchema.parse(manyChoices.json()).error.type).toBe('invalid_request_error');
    expect(OpenAiErrorFixtureSchema.parse(manyChoices.json()).error.message).toContain('"n"');

    const withTools = await api().app.inject({
      method: 'POST',
      payload: {
        messages: [{ content: 'Привет.', role: 'user' }],
        tools: [{ function: { name: 'search' }, type: 'function' }],
      },
      url: '/v1/chat/completions',
    });
    expect(withTools.statusCode).toBe(400);

    const noMessages = await api().app.inject({
      method: 'POST',
      payload: { messages: [] },
      url: '/v1/chat/completions',
    });
    expect(noMessages.statusCode).toBe(400);
    expect(api().http.requestLines()).toEqual([]);
  });

  it('answers an unsupported feature with 400 invalid_request_error', async () => {
    const response = await api().app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }], tool_choice: 'auto' },
      url: '/v1/chat/completions',
    });

    expect(response.statusCode).toBe(400);
    expect(OpenAiErrorFixtureSchema.parse(response.json())).toEqual({
      error: {
        code: 'unsupported_feature',
        message: 'Tool calls are not supported by this endpoint.',
        type: 'invalid_request_error',
      },
    });
    expect(api().http.requestLines()).toEqual([]);
  });

  it('answers a request body that breaks the schema with 400 invalid_request naming each issue by its path', async () => {
    const response = await api().app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: '' }], temperature: 'тёплая' },
      url: '/v1/chat/completions',
    });
    const { error } = OpenAiErrorFixtureSchema.parse(response.json());

    expect(response.statusCode).toBe(400);
    expect(error).toMatchObject({ code: 'invalid_request', type: 'invalid_request_error' });
    expect(error.message.split('; ').map((issue) => issue.slice(0, issue.indexOf(': ')))).toEqual([
      'messages.0.role',
      'temperature',
    ]);
  });

  it('answers malformed JSON with an OpenAI error envelope', async () => {
    const response = await api().app.inject({
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      payload: '{"messages": [{"content": "Привет.",',
      url: '/v1/chat/completions',
    });

    expect(response.statusCode).toBe(400);
    expect(OpenAiErrorFixtureSchema.parse(response.json()).error).toMatchObject({
      code: 'invalid_request',
      type: 'invalid_request_error',
    });
  });

  it('answers a body type it cannot read with 415 and a body over the limit with 413, both in the OpenAI envelope', async () => {
    const xml = await api().app.inject({
      headers: { 'content-type': 'application/xml' },
      method: 'POST',
      payload: '<messages/>',
      url: '/v1/chat/completions',
    });
    const oversized = await api().app.inject({
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      payload: `{"messages": [], "padding": "${'ж'.repeat(8 * 1024 * 1024)}"}`,
      url: '/v1/chat/completions',
    });

    expect(xml.statusCode).toBe(415);
    expect(OpenAiErrorFixtureSchema.parse(xml.json()).error).toMatchObject({
      code: 'unsupported_media_type',
      type: 'invalid_request_error',
    });
    expect(oversized.statusCode).toBe(413);
    expect(OpenAiErrorFixtureSchema.parse(oversized.json()).error).toMatchObject({
      code: 'request_too_large',
      type: 'invalid_request_error',
    });
  });

  it('answers an unknown /v1 route with an OpenAI 404 envelope while unknown /api routes keep the API problem', async () => {
    const embeddings = await api().app.inject({ method: 'POST', payload: { input: 'текст' }, url: '/v1/embeddings' });
    const unknownApi = await api().app.inject({ method: 'GET', url: '/api/embeddings' });

    expect(embeddings.statusCode).toBe(404);
    expect(OpenAiErrorFixtureSchema.parse(embeddings.json()).error).toMatchObject({
      code: 'route_not_found',
      type: 'invalid_request_error',
    });
    expect(unknownApi.statusCode).toBe(404);
    expect(unknownApi.json()).toEqual({ code: 'route_not_found', message: expect.any(String) });
  });

  it('answers a blank provider URL with 500 server_error, since stored settings that break their schema are a server fault and not the caller', async () => {
    await api().settings.useExternalProvider({ model: 'fixture-model', url: '' });

    const response = await api().app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }] },
      url: '/v1/chat/completions',
    });

    expect(response.statusCode).toBe(500);
    expect(OpenAiErrorFixtureSchema.parse(response.json()).error).toMatchObject({
      code: 'internal_error',
      type: 'server_error',
    });
    expect(api().http.requestLines()).toEqual([]);
  });

  it('streams over a real socket although the POST request stream closes as soon as the body is read', async () => {
    answerWith(() => openAiChatStream([{ content: 'Живой ' }, { content: 'поток.' }]));
    const origin = await api().listen();

    const response = await requestOverSocket(`${origin}/v1/chat/completions`, {
      json: { messages: [{ content: 'Привет.', role: 'user' }], stream: true },
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(response.body).toContain('"content":"Живой "');
    expect(response.body).toContain('"finish_reason":"stop"');
    expect(response.body.trimEnd().endsWith('data: [DONE]')).toBe(true);
  });

  function answerWithStreamUntilAborted(): Promise<void> {
    const providerAborted = createDeferred();

    answerWith((request) => {
      const firstChunk = `data: ${JSON.stringify({ choices: [{ delta: { content: 'Первый кусок.' } }] })}\n\n`;
      request.signal?.addEventListener('abort', () => providerAborted.resolve(), { once: true });

      return bodyHeldUntilAborted(request.signal, 'text/event-stream', firstChunk);
    });

    return providerAborted.promise;
  }

  async function openStreamThenDisconnect(origin: string): Promise<void> {
    const request = http.request(`${origin}/v1/chat/completions`, {
      agent: false,
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    request.end(JSON.stringify({ messages: [{ content: 'Привет.', role: 'user' }], stream: true }));

    const [response] = await once(request, 'response');
    await once(response, 'data');
    request.destroy();
  }

  it('stops the provider request when the streaming client disconnects', async () => {
    const providerAborted = answerWithStreamUntilAborted();

    await openStreamThenDisconnect(await api().listen());

    await expect(providerAborted).resolves.toBeUndefined();
  });

  it('logs a streaming client that disconnects as a client disconnect, not as a server error', async () => {
    const providerAborted = answerWithStreamUntilAborted();
    const outcome = clientDisconnectOutcome(api().logs);

    await openStreamThenDisconnect(await api().listen());
    await providerAborted;

    expect(await outcome).toMatchObject({
      level: 'info',
      msg: CLIENT_DISCONNECT_LOG_MESSAGE,
      reqId: expect.any(String),
    });
    expect(api().logs.lines.filter((line) => line.level === 'error')).toEqual([]);
  });

  it('logs a non-streaming client that disconnects as a client disconnect, not as a server error', async () => {
    const provider = api().http.hold('POST', CHAT_COMPLETIONS_URL);
    const client = openSocketRequest(`${await api().listen()}/v1/chat/completions`, {
      messages: [{ content: 'Привет.', role: 'user' }],
    });
    await provider.started;
    const outcome = clientDisconnectOutcome(api().logs);

    await client.disconnect();

    expect(await outcome).toMatchObject({
      level: 'info',
      msg: CLIENT_DISCONNECT_LOG_MESSAGE,
      reqId: expect.any(String),
    });
    expect(api().logs.lines.filter((line) => line.level === 'error')).toEqual([]);
  });

  it('stops the provider request when a non-streaming client disconnects', async () => {
    const provider = api().http.hold('POST', CHAT_COMPLETIONS_URL);
    const client = openSocketRequest(`${await api().listen()}/v1/chat/completions`, {
      messages: [{ content: 'Привет.', role: 'user' }],
    });
    const providerRequest = await provider.started;

    expect(providerRequest.signal?.aborted).toBe(false);

    await client.disconnect();
    await provider.aborted;

    expect(providerRequest.signal?.aborted).toBe(true);
  });

  it('lists the models the provider reports', async () => {
    api().http.on('GET', MODELS_URL, () => Response.json({ data: [{ id: 'fixture-model' }, { id: 'another-model' }] }));

    const response = await api().app.inject({ method: 'GET', url: '/v1/models' });
    const payload = OpenAiModelListFixtureSchema.parse(response.json());

    expect(payload.object).toBe('list');
    expect(payload.data.map((model) => model.id)).toEqual(['fixture-model', 'another-model']);
    expect(payload.data[0]?.object).toBe('model');
    expect(api().http.requestLines()).toEqual([`GET ${MODELS_URL}`]);
  });

  it('lists the configured model when the provider has no model catalog', async () => {
    api().http.on('GET', MODELS_URL, () => new Response('not found', { status: 404 }));

    const response = await api().app.inject({ method: 'GET', url: '/v1/models' });

    expect(OpenAiModelListFixtureSchema.parse(response.json()).data.map((model) => model.id)).toEqual([
      'fixture-model',
    ]);
  });

  it('lists no models, rather than an invented one, when no provider can answer', async () => {
    await api().settings.patch({ backendMode: 'builtin' });

    const response = await api().app.inject({ method: 'GET', url: '/v1/models' });

    expect(OpenAiModelListFixtureSchema.parse(response.json()).data).toEqual([]);
    expect(api().http.requestLines()).toEqual([]);
  });
});

describe('OpenAI-compatible endpoint on an injected chat completion client', () => {
  it('serves a completion from an injected ChatCompletionClient without outbound HTTP', async () => {
    const clockStart = new Date('2026-10-26T12:00:00.000Z');
    const client = new FakeChatCompletionClient().reply({ content: 'Ответ без сети.' });
    const api = await createTestApi({
      clock: { start: clockStart, stepMs: 0 },
      fixture: 'smoke',
      overrides: { chatCompletionClient: client },
    });
    await api.settings.patch({
      activeProvider: 'custom',
      backendMode: 'external',
      providerConfigs: { custom: { model: 'fixture-model', url: PROVIDER_URL } },
    });

    const response = await api.app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Скажи привет.', role: 'user' }] },
      url: '/v1/chat/completions',
    });
    const payload = OpenAiChatCompletionFixtureSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.choices[0].message.content).toBe('Ответ без сети.');
    expect(payload.created).toBe(clockStart.getTime() / 1000);
    expect(client.requests.map((request) => request.endpoint)).toEqual([
      { apiKey: null, apiKind: 'openai-compatible', baseUrl: PROVIDER_URL, contextSize: null, model: 'fixture-model' },
    ]);
    expect(api.http.requests).toEqual([]);
  });
});
