import { CreateChatResponseSchema } from '@immersion/contracts/chats';
import { describe, expect, it } from 'vitest';

import { useTestApi } from './test-support/use-test-api.js';

const STORED_KEYS = {
  anthropic: 'sk-ant-canary-anthropic',
  custom: 'sk-canary-custom',
  koboldcpp: 'sk-canary-koboldcpp',
  openai: 'sk-canary-openai',
} as const;

const LINE_BREAK_KEY = 'sk-canary-line\nbreak';

describe('stored provider keys are write-only', () => {
  const api = useTestApi();

  async function seedKeysForEveryProvider(): Promise<void> {
    await api().settings.write({
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: {
        anthropic: { apiKey: STORED_KEYS.anthropic, model: 'claude-sonnet-4-5', url: 'https://api.anthropic.com/v1' },
        custom: { apiKey: STORED_KEYS.custom, model: 'local-model', url: 'http://127.0.0.1:6001' },
        koboldcpp: { apiKey: STORED_KEYS.koboldcpp, url: 'http://127.0.0.1:5001' },
        openai: { apiKey: STORED_KEYS.openai, model: 'gpt-4o', url: 'https://api.openai.com/v1' },
      },
    });
    api().http.on('GET', /\/models$/u, () => Response.json({ data: [{ id: 'local-model' }] }));
  }

  async function createChatId(): Promise<string> {
    const response = await api().app.inject({ method: 'POST', url: '/api/chats', payload: { title: 'Key exposure' } });

    return CreateChatResponseSchema.parse(response.json()).chat.id;
  }

  it('never puts a stored key into a response body or a log line', async () => {
    await seedKeysForEveryProvider();
    const { app, logs } = api();
    const chatId = await createChatId();

    const responses = [
      await app.inject({ method: 'GET', url: '/api/providers/settings' }),
      await app.inject({ method: 'GET', url: '/api/providers/overview' }),
      await app.inject({ method: 'GET', url: '/api/providers/definitions' }),
      await app.inject({ method: 'GET', url: '/api/providers/connection' }),
      await app.inject({
        method: 'POST',
        url: '/api/providers/models',
        payload: { provider: 'custom', url: 'http://127.0.0.1:6001' },
      }),
      await app.inject({
        method: 'PATCH',
        url: '/api/providers/settings',
        payload: { config: { model: 'next-model' } },
      }),
      await app.inject({ method: 'PATCH', url: '/api/providers/settings', payload: { activeProvider: 'openai' } }),
      await app.inject({ method: 'PATCH', url: '/api/providers/settings', payload: { mode: 'builtin' } }),
      await app.inject({ method: 'PATCH', url: '/api/providers/settings', payload: { mode: 'external' } }),
      await app.inject({ method: 'GET', url: '/api/generation/readiness' }),
      await app.inject({
        method: 'POST',
        url: '/api/generation/chat-reply-preview',
        payload: { chatId, draftUserMessage: 'Preview the prompt.' },
      }),
      await app.inject({ method: 'GET', url: '/api/settings/overview' }),
      await app.inject({ method: 'GET', url: '/v1/models' }),
    ];

    expect(responses.map((response) => response.statusCode)).toEqual([
      200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200,
    ]);

    for (const response of responses) {
      for (const key of Object.values(STORED_KEYS)) {
        expect(response.body).not.toContain(key);
      }
    }

    const logText = JSON.stringify(logs.lines);

    for (const key of Object.values(STORED_KEYS)) {
      expect(logText).not.toContain(key);
    }
  });

  it('accepts a new key on write and reports it only as configured', async () => {
    await seedKeysForEveryProvider();
    const { app } = api();

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/providers/settings',
      payload: { activeProvider: 'openai', config: { apiKey: 'sk-new-openai-key' } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('sk-new-openai-key');
    expect(response.json()).toMatchObject({ providerConfigs: { openai: { apiKeyConfigured: true } } });
    expect((await api().settings.read()).providerConfigs).toMatchObject({ openai: { apiKey: 'sk-new-openai-key' } });
  });

  it('refuses a key that could not travel in a header, so no transport error can echo it', async () => {
    const { app } = api();

    const patched = await app.inject({
      method: 'PATCH',
      url: '/api/providers/settings',
      payload: { config: { apiKey: LINE_BREAK_KEY } },
    });
    const probed = await app.inject({
      method: 'POST',
      url: '/api/providers/models',
      payload: { apiKey: LINE_BREAK_KEY, provider: 'custom', url: 'http://127.0.0.1:6001' },
    });

    expect([patched.statusCode, probed.statusCode]).toEqual([400, 400]);
    expect(patched.body + probed.body).not.toContain('sk-canary-line');
  });

  it('treats a hand-edited stored key with a line break as missing, and never sends or returns it', async () => {
    await api().settings.write({
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: { custom: { apiKey: LINE_BREAK_KEY, url: 'http://127.0.0.1:6001' } },
    });
    api().http.on('GET', /\/models$/u, () => Response.json({ data: [{ id: 'local-model' }] }));
    const { app } = api();

    const responses = [
      await app.inject({ method: 'GET', url: '/api/providers/settings' }),
      await app.inject({ method: 'GET', url: '/api/providers/connection' }),
      await app.inject({
        method: 'POST',
        url: '/api/providers/models',
        payload: { provider: 'custom', url: 'http://127.0.0.1:6001' },
      }),
    ];

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
    expect(responses[0]?.json()).toMatchObject({ providerConfigs: { custom: { apiKeyConfigured: false } } });
    for (const response of responses) {
      expect(response.body).not.toContain('sk-canary-line');
    }
    expect(api().http.requests.map((request) => request.headers.get('authorization'))).toEqual([null, null]);
  });
});
