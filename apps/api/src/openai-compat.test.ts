import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApiApp } from './app.js';

const fixtureDataRoot = fileURLToPath(new URL('../testdata/smoke-data', import.meta.url));

interface CapturedProviderRequest {
  body: Record<string, unknown>;
  url: string;
}

function messagesOf(request: CapturedProviderRequest | undefined) {
  return (request?.body.messages ?? []) as Array<{ content: unknown; role: string }>;
}

describe('OpenAI-compatible endpoint', () => {
  let previousDataRoot: string | undefined;
  let temporaryDataRoot: string;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    previousDataRoot = process.env.IMMERSION_DATA_ROOT;
    temporaryDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-openai-compat-'));
    await fs.cp(fixtureDataRoot, temporaryDataRoot, { recursive: true });
    process.env.IMMERSION_DATA_ROOT = temporaryDataRoot;

    const settingsPath = path.join(temporaryDataRoot, 'user-settings.json');
    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as Record<string, unknown>;
    settings.backendMode = 'external';
    settings.activeProvider = 'custom';
    settings.providerConfigs = { custom: { model: 'fixture-model', url: 'http://127.0.0.1:6007' } };
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();

    if (previousDataRoot) {
      process.env.IMMERSION_DATA_ROOT = previousDataRoot;
    } else {
      delete process.env.IMMERSION_DATA_ROOT;
    }

    await fs.rm(temporaryDataRoot, { recursive: true, force: true });
  });

  function mockProvider(body: string, contentType = 'application/json') {
    const requests: CapturedProviderRequest[] = [];

    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      requests.push({
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : {},
        url: input instanceof Request ? input.url : input.toString(),
      });

      return new Response(body, { headers: { 'Content-Type': contentType }, status: 200 });
    }) as unknown as typeof fetch;

    return requests;
  }

  function jsonCompletion(content: string) {
    return JSON.stringify({ choices: [{ message: { content } }] });
  }

  it('answers a plain chat completion in the OpenAI response shape', async () => {
    const providerRequests = mockProvider(jsonCompletion('Привет из Immersion.'));
    const app = buildApiApp();

    const response = await app.inject({
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
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(payload.object).toBe('chat.completion');
    expect(payload.choices[0].message).toMatchObject({ content: 'Привет из Immersion.', role: 'assistant' });
    expect(payload.choices[0].finish_reason).toBe('stop');
    expect(payload.model).toBe('fixture-model');
    expect(payload.usage.total_tokens).toBe(payload.usage.prompt_tokens + payload.usage.completion_tokens);
    expect(payload.usage.prompt_tokens).toBeGreaterThan(0);

    // История берётся из запроса и на диск не пишется: чатов не прибавилось.
    expect(messagesOf(providerRequests[0]).map((message) => message.role)).toEqual(['system', 'user']);
    expect(providerRequests[0]?.url).toBe('http://127.0.0.1:6007/v1/chat/completions');

    await app.close();
  });

  it('applies the sampler preset and lets the request override temperature', async () => {
    const providerRequests = mockProvider(jsonCompletion('ок'));
    const app = buildApiApp();

    await app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }], temperature: 0.1 },
      url: '/v1/chat/completions',
    });

    expect(providerRequests[0]?.body.temperature).toBe(0.1);
    expect(providerRequests[0]?.body.min_p).toBeDefined();
    expect(providerRequests[0]?.body.rep_pen).toBeDefined();

    await app.close();
  });

  it('passes the requested model through to the provider', async () => {
    const providerRequests = mockProvider(jsonCompletion('ок'));
    const app = buildApiApp();

    const response = await app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }], model: 'some-other-model' },
      url: '/v1/chat/completions',
    });

    expect(providerRequests[0]?.body.model).toBe('some-other-model');
    expect(response.json().model).toBe('some-other-model');

    await app.close();
  });

  it('forwards image parts of a multimodal message', async () => {
    const providerRequests = mockProvider(jsonCompletion('вижу'));
    const app = buildApiApp();

    await app.inject({
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

    expect(messagesOf(providerRequests[0])[0]?.content).toEqual([
      { text: 'Что на картинке?', type: 'text' },
      { image_url: { url: 'data:image/png;base64,AAAB' }, type: 'image_url' },
    ]);

    await app.close();
  });

  it('streams chunks and closes the stream with [DONE]', async () => {
    const sse = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'При' } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'вет.' } }] })}\n\n`,
      'data: [DONE]\n\n',
    ].join('');
    mockProvider(sse, 'text/event-stream');
    const app = buildApiApp();

    const response = await app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }], stream: true },
      url: '/v1/chat/completions',
    });
    const chunks = response.body
      .split('\n\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice('data: '.length));

    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(chunks.at(-1)).toBe('[DONE]');

    const parsed = chunks.slice(0, -1).map((chunk) => JSON.parse(chunk));
    expect(parsed[0].choices[0].delta.role).toBe('assistant');
    expect(parsed.map((chunk) => chunk.choices[0].delta.content ?? '').join('')).toBe('Привет.');
    expect(parsed.at(-1).choices[0].finish_reason).toBe('stop');
    expect(parsed.every((chunk) => chunk.object === 'chat.completion.chunk')).toBe(true);

    await app.close();
  });

  it('streams a single chunk when the provider answers without streaming', async () => {
    mockProvider(jsonCompletion('Целиком.'));
    const app = buildApiApp();

    const response = await app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }], stream: true },
      url: '/v1/chat/completions',
    });
    const contents = response.body
      .split('\n\n')
      .filter((line) => line.startsWith('data: ') && !line.includes('[DONE]'))
      .map((line) => JSON.parse(line.slice('data: '.length)).choices[0].delta.content ?? '');

    expect(contents.join('')).toBe('Целиком.');

    await app.close();
  });

  it('reports reasoning on its own field instead of mixing it into the reply', async () => {
    mockProvider(JSON.stringify({ choices: [{ message: { content: '<think>Взвешиваю</think>Ответ.' } }] }));
    const app = buildApiApp();

    const response = await app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }] },
      url: '/v1/chat/completions',
    });

    expect(response.json().choices[0].message.content).toBe('Ответ.');
    expect(response.json().choices[0].message.reasoning_content).toBe('Взвешиваю');

    await app.close();
  });

  it('forwards server extensions such as enable_thinking to a local provider', async () => {
    const providerRequests = mockProvider(jsonCompletion('ок'));
    const app = buildApiApp();

    await app.inject({
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

    expect(providerRequests[0]?.body).toMatchObject({
      chat_template_kwargs: { enable_thinking: false },
      enable_thinking: false,
      seed: 42,
      stop: ['<<STOP>>'],
    });
    // Наши поля расширения не перекрывают.
    expect(providerRequests[0]?.body.messages).toBeDefined();

    await app.close();
  });

  it('answers with finish_reason length instead of failing when thinking ate the budget', async () => {
    mockProvider(JSON.stringify({ choices: [{ message: { content: '<think>Всё ушло сюда' } }] }));
    const app = buildApiApp();

    const response = await app.inject({
      method: 'POST',
      payload: { max_tokens: 8, messages: [{ content: 'Привет.', role: 'user' }] },
      url: '/v1/chat/completions',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().choices[0].finish_reason).toBe('length');
    expect(response.json().choices[0].message.content).toBe('');
    expect(response.json().choices[0].message.reasoning_content).toBe('Всё ушло сюда');

    await app.close();
  });

  it('rejects what it cannot honour instead of answering something else', async () => {
    mockProvider(jsonCompletion('ок'));
    const app = buildApiApp();

    const manyChoices = await app.inject({
      method: 'POST',
      payload: { messages: [{ content: 'Привет.', role: 'user' }], n: 3 },
      url: '/v1/chat/completions',
    });
    expect(manyChoices.statusCode).toBe(400);
    expect(manyChoices.json().error.type).toBe('invalid_request_error');

    const withTools = await app.inject({
      method: 'POST',
      payload: {
        messages: [{ content: 'Привет.', role: 'user' }],
        tools: [{ function: { name: 'search' }, type: 'function' }],
      },
      url: '/v1/chat/completions',
    });
    expect(withTools.statusCode).toBe(400);

    const noMessages = await app.inject({
      method: 'POST',
      payload: { messages: [] },
      url: '/v1/chat/completions',
    });
    expect(noMessages.statusCode).toBe(400);

    await app.close();
  });

  // app.inject не поднимает сокет, а именно на нём вылезла отмена генерации:
  // у POST поток запроса закрывается сразу после чтения тела.
  it('streams over a real socket without aborting itself', async () => {
    const sse = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'Живой ' } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'поток.' } }] })}\n\n`,
      'data: [DONE]\n\n',
    ].join('');
    mockProvider(sse, 'text/event-stream');
    const app = buildApiApp();
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const response = await originalFetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      body: JSON.stringify({ messages: [{ content: 'Привет.', role: 'user' }], stream: true }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('"content":"Живой "');
    expect(body).toContain('"finish_reason":"stop"');
    expect(body.trimEnd().endsWith('data: [DONE]')).toBe(true);

    await app.close();
  });

  it('lists the models the provider reports', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ data: [{ id: 'fixture-model' }, { id: 'another-model' }] }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }) as unknown as typeof fetch;
    const app = buildApiApp();

    const response = await app.inject({ method: 'GET', url: '/v1/models' });
    const payload = response.json();

    expect(payload.object).toBe('list');
    expect(payload.data.map((model: { id: string }) => model.id)).toEqual(['fixture-model', 'another-model']);
    expect(payload.data[0].object).toBe('model');

    await app.close();
  });
});
