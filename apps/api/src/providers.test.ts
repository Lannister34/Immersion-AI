import fs from 'node:fs/promises';

import { ApiProblemSchema } from '@immersion/contracts/common';
import {
  ProviderConnectionResponseSchema,
  ProviderSettingsSnapshotSchema,
  type UpdateProviderSettingsCommand,
} from '@immersion/contracts/providers';
import { describe, expect, it } from 'vitest';

import { useTestApi } from './test-support/use-test-api.js';

describe('provider settings routes', () => {
  const api = useTestApi();

  function answerProviderModels(payload: unknown, status = 200) {
    const { http } = api();
    http.on('GET', /\/models$/u, () => Response.json(payload, { status }));

    return {
      requests: () =>
        http.requests.map((request) => ({ authorization: request.headers.get('authorization'), url: request.url })),
    };
  }

  it('reads provider settings from the canonical file-backed source', async () => {
    await api().settings.write({
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: {
        custom: {
          url: 'http://127.0.0.1:6001',
          apiKey: 'secret',
        },
      },
    });

    const { app } = api();
    const response = await app.inject({
      method: 'GET',
      url: '/api/providers/settings',
    });

    expect(response.statusCode).toBe(200);
    expect(ProviderSettingsSnapshotSchema.parse(response.json())).toMatchObject({
      mode: 'external',
      activeProvider: 'custom',
      providerConfigs: {
        custom: {
          url: 'http://127.0.0.1:6001',
          apiKey: 'secret',
          model: 'local-model',
        },
      },
    });
  });

  it('tests the active external provider models endpoint without exposing secrets', async () => {
    await api().settings.useExternalProvider({
      apiKey: 'secret',
      model: 'existing-model',
      url: 'http://127.0.0.1:6001',
    });
    const before = await fs.readFile(api().settings.path, 'utf8');
    const provider = answerProviderModels({
      data: [
        {
          id: 'local-model-a',
        },
        {
          id: 'local-model-b',
        },
      ],
    });

    const { app } = api();
    const response = await app.inject({
      method: 'GET',
      url: '/api/providers/connection',
    });
    const payload = ProviderConnectionResponseSchema.parse(response.json());
    const after = await fs.readFile(api().settings.path, 'utf8');

    expect(response.statusCode).toBe(200);
    expect(payload).toEqual({
      activeProvider: 'custom',
      endpoint: 'http://127.0.0.1:6001/v1/models',
      issue: null,
      mode: 'external',
      models: [
        {
          id: 'local-model-a',
        },
        {
          id: 'local-model-b',
        },
      ],
      status: 'ok',
    });
    expect(JSON.stringify(payload)).not.toContain('secret');
    expect(provider.requests()).toEqual([
      {
        authorization: 'Bearer secret',
        url: 'http://127.0.0.1:6001/v1/models',
      },
    ]);
    expect(after).toBe(before);
  });

  it('does not duplicate the v1 suffix when testing provider models', async () => {
    await api().settings.write({
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: { custom: { url: 'http://127.0.0.1:6001/v1' } },
    });
    const provider = answerProviderModels({
      data: [
        {
          id: 'model-from-v1-base',
        },
      ],
    });

    const { app } = api();
    const response = await app.inject({
      method: 'GET',
      url: '/api/providers/connection',
    });
    const payload = ProviderConnectionResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.endpoint).toBe('http://127.0.0.1:6001/v1/models');
    expect(payload.models).toEqual([
      {
        id: 'model-from-v1-base',
      },
    ]);
    expect(provider.requests().map((request) => request.url)).toEqual(['http://127.0.0.1:6001/v1/models']);
  });

  it('returns a typed provider connection issue when the external URL is missing', async () => {
    await api().settings.write({
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: { custom: { url: '   ' } },
    });
    const provider = answerProviderModels({
      data: [],
    });

    const { app } = api();
    const response = await app.inject({
      method: 'GET',
      url: '/api/providers/connection',
    });
    const payload = ProviderConnectionResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload).toMatchObject({
      endpoint: null,
      issue: {
        code: 'provider_url_missing',
      },
      status: 'error',
    });
    expect(provider.requests()).toHaveLength(0);
  });

  it('returns a typed provider connection issue when the external URL is invalid', async () => {
    await api().settings.write({
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: { custom: { url: 'not-a-url' } },
    });
    const provider = answerProviderModels({
      data: [],
    });

    const { app } = api();
    const response = await app.inject({
      method: 'GET',
      url: '/api/providers/connection',
    });
    const payload = ProviderConnectionResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload).toMatchObject({
      endpoint: null,
      issue: {
        code: 'provider_url_invalid',
      },
      status: 'error',
    });
    expect(provider.requests()).toHaveLength(0);
  });

  it('returns a typed provider connection issue when the provider responds with HTTP failure', async () => {
    await api().settings.write({
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: { custom: { url: 'http://127.0.0.1:6001' } },
    });
    const provider = answerProviderModels({ error: 'failed' }, 500);

    const { app } = api();
    const response = await app.inject({
      method: 'GET',
      url: '/api/providers/connection',
    });
    const payload = ProviderConnectionResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload).toMatchObject({
      endpoint: 'http://127.0.0.1:6001/v1/models',
      issue: {
        code: 'provider_http_error',
      },
      models: [],
      status: 'error',
    });
    expect(provider.requests()).toHaveLength(1);
  });

  it('returns a typed provider connection issue when the models payload is invalid', async () => {
    await api().settings.write({
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: { custom: { url: 'http://127.0.0.1:6001' } },
    });
    const provider = answerProviderModels({
      unexpected: [],
    });

    const { app } = api();
    const response = await app.inject({
      method: 'GET',
      url: '/api/providers/connection',
    });
    const payload = ProviderConnectionResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload).toMatchObject({
      issue: {
        code: 'provider_invalid_response',
      },
      models: [],
      status: 'error',
    });
    expect(provider.requests()).toHaveLength(1);
  });

  it('returns a typed provider connection issue when builtin runtime is not running', async () => {
    await api().settings.write({
      backendMode: 'builtin',
      activeProvider: 'custom',
      providerConfigs: {
        custom: {
          url: 'http://127.0.0.1:6001',
        },
      },
    });
    const provider = answerProviderModels({
      data: [
        {
          id: 'should-not-fetch',
        },
      ],
    });

    const { app } = api();
    const response = await app.inject({
      method: 'GET',
      url: '/api/providers/connection',
    });
    const payload = ProviderConnectionResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload).toMatchObject({
      endpoint: null,
      issue: {
        code: 'builtin_runtime_not_running',
      },
      mode: 'builtin',
      models: [],
      status: 'error',
    });
    expect(provider.requests()).toHaveLength(0);
  });

  it('updates provider settings without overwriting unrelated user settings', async () => {
    await api().settings.write({
      userName: 'Misha',
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: {
        custom: {
          url: 'http://127.0.0.1:6001',
          apiKey: 'secret',
        },
      },
    });
    const command: UpdateProviderSettingsCommand = {
      mode: 'builtin',
      activeProvider: 'custom',
      providerConfigs: {
        custom: {
          url: 'http://127.0.0.1:6001',
          model: 'settings-model',
        },
      },
    };

    const { app } = api();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/providers/settings',
      payload: command,
    });

    expect(response.statusCode).toBe(200);
    expect(ProviderSettingsSnapshotSchema.parse(response.json())).toMatchObject({
      mode: 'builtin',
      activeProvider: 'custom',
      providerConfigs: {
        custom: {
          url: 'http://127.0.0.1:6001',
          model: 'settings-model',
        },
      },
    });

    const stored = await api().settings.read();

    expect(stored.userName).toBe('Misha');
    expect(stored.backendMode).toBe('builtin');
    expect(stored.activeProvider).toBe('custom');
    expect(stored.providerConfigs).toMatchObject({
      custom: {
        url: 'http://127.0.0.1:6001',
        model: 'settings-model',
      },
    });
  });

  it('patches a single provider field without touching the rest', async () => {
    await api().settings.write({
      userName: 'Misha',
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: {
        custom: { url: 'http://127.0.0.1:6001', apiKey: 'secret', model: 'old-model' },
        koboldcpp: { url: 'http://127.0.0.1:5001' },
      },
    });

    const { app } = api();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/providers/settings',
      payload: { config: { model: 'new-model' } },
    });
    const snapshot = ProviderSettingsSnapshotSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(snapshot.providerConfigs.custom).toMatchObject({
      apiKey: 'secret',
      model: 'new-model',
      url: 'http://127.0.0.1:6001',
    });
    expect(snapshot.mode).toBe('external');
    expect(snapshot.providerConfigs.koboldcpp?.url).toBe('http://127.0.0.1:5001');

    const stored = await api().settings.read();
    expect(stored).toMatchObject({ userName: 'Misha' });
  });

  it('keeps both of two concurrent patches that change different fields', async () => {
    await api().settings.write({
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: { custom: { url: 'http://127.0.0.1:6001', model: 'old-model' } },
    });
    const { app } = api();

    const responses = await Promise.all([
      app.inject({ method: 'PATCH', url: '/api/providers/settings', payload: { config: { model: 'model-A' } } }),
      app.inject({ method: 'PATCH', url: '/api/providers/settings', payload: { config: { apiKey: 'sk-B' } } }),
    ]);
    const stored = await api().settings.read();

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(stored).toMatchObject({
      providerConfigs: { custom: { apiKey: 'sk-B', model: 'model-A', url: 'http://127.0.0.1:6001' } },
    });
  });

  it('switches the provider, applies the config to the one that becomes active and leaves the previous one untouched', async () => {
    await api().settings.write({
      backendMode: 'builtin',
      activeProvider: 'custom',
      providerConfigs: { custom: { url: 'http://127.0.0.1:6001', model: 'local-model' } },
    });

    const { app } = api();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/providers/settings',
      payload: {
        activeProvider: 'anthropic',
        config: { apiKey: 'sk-ant-test', model: 'claude-sonnet-4-5' },
        mode: 'external',
      },
    });
    const snapshot = ProviderSettingsSnapshotSchema.parse(response.json());

    expect(snapshot.mode).toBe('external');
    expect(snapshot.activeProvider).toBe('anthropic');
    expect(snapshot.providerConfigs.anthropic).toMatchObject({
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4-5',
      url: 'https://api.anthropic.com/v1',
    });
    expect(snapshot.providerConfigs.custom).toEqual({ model: 'local-model', url: 'http://127.0.0.1:6001' });
  });

  it('clears the api key on an empty string and keeps it when the field is absent', async () => {
    await api().settings.write({
      backendMode: 'external',
      activeProvider: 'openai',
      providerConfigs: { openai: { url: 'https://api.openai.com/v1', apiKey: 'sk-old', model: 'gpt-4o' } },
    });
    const { app } = api();

    const untouched = await app.inject({
      method: 'PATCH',
      url: '/api/providers/settings',
      payload: { config: { model: 'gpt-4o-mini' } },
    });
    expect(ProviderSettingsSnapshotSchema.parse(untouched.json()).providerConfigs.openai?.apiKey).toBe('sk-old');

    const cleared = await app.inject({
      method: 'PATCH',
      url: '/api/providers/settings',
      payload: { config: { apiKey: '' } },
    });
    expect(ProviderSettingsSnapshotSchema.parse(cleared.json()).providerConfigs.openai?.apiKey).toBeUndefined();
  });

  it('lists models with the key typed into the form, not the stored one, so the list comes before saving', async () => {
    await api().settings.write({
      backendMode: 'external',
      activeProvider: 'openai',
      providerConfigs: { openai: { url: 'https://api.openai.com/v1', apiKey: 'sk-stored', model: 'gpt-4o' } },
    });
    const provider = answerProviderModels({ data: [{ id: 'gpt-4o-mini' }] });
    const { app } = api();

    const response = await app.inject({
      method: 'POST',
      url: '/api/providers/models',
      payload: { apiKey: 'sk-typed', provider: 'openai', url: 'https://api.openai.com/v1' },
    });

    expect(ProviderConnectionResponseSchema.parse(response.json()).models).toEqual([{ id: 'gpt-4o-mini' }]);
    expect(provider.requests()).toEqual([
      { authorization: 'Bearer sk-typed', url: 'https://api.openai.com/v1/models' },
    ]);
  });

  it('rejects a patch that changes nothing or carries an empty url', async () => {
    await api().settings.write({
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: { custom: { url: 'http://127.0.0.1:6001' } },
    });
    const { app } = api();

    const empty = await app.inject({ method: 'PATCH', url: '/api/providers/settings', payload: {} });
    expect(empty.statusCode).toBe(400);

    const blankUrl = await app.inject({
      method: 'PATCH',
      url: '/api/providers/settings',
      payload: { config: { url: '   ' } },
    });
    expect(blankUrl.statusCode).toBe(400);
  });

  it('falls back to default settings when the canonical source file contains invalid JSON', async () => {
    await fs.writeFile(api().settings.path, '{ invalid json', 'utf8');

    const { app } = api();
    const response = await app.inject({
      method: 'GET',
      url: '/api/providers/settings',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      mode: 'builtin',
      activeProvider: 'custom',
    });
  });

  it('rejects an invalid provider settings payload with 400 validation_error', async () => {
    await api().settings.write({
      userName: 'Misha',
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: { custom: { url: 'http://127.0.0.1:6001' } },
    });
    const before = await fs.readFile(api().settings.path, 'utf8');
    const { app, logs } = api();

    const response = await app.inject({
      method: 'PUT',
      url: '/api/providers/settings',
      payload: { mode: 'cloud', activeProvider: 'custom', providerConfigs: {} },
    });

    expect(response.statusCode).toBe(400);
    expect(ApiProblemSchema.parse(response.json())).toMatchObject({ code: 'validation_error' });
    expect(await fs.readFile(api().settings.path, 'utf8')).toBe(before);
    expect(logs.lines.filter((line) => line.level === 'error')).toEqual([]);
  });

  it('a malformed stored provider config makes GET /api/providers/settings a logged 500, not a 400', async () => {
    await fs.writeFile(
      api().settings.path,
      JSON.stringify({ activeProvider: 'no-such-provider', backendMode: 'external' }),
      'utf8',
    );
    const { app, logs } = api();

    const response = await app.inject({ method: 'GET', url: '/api/providers/settings' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ code: 'internal_error', message: 'Unexpected error.' });
    expect(logs.lines).toContainEqual(
      expect.objectContaining({ err: expect.objectContaining({ type: 'ZodError' }), level: 'error' }),
    );
  });
});
