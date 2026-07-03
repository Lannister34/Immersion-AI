import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  ProviderConnectionResponseSchema,
  ProviderSettingsSnapshotSchema,
  type UpdateProviderSettingsCommand,
} from '@immersion/contracts/providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApiApp } from './app.js';

interface ProviderConnectionRequestRecord {
  authorization: string | null;
  url: string;
}

describe('provider settings routes', () => {
  let dataRoot = '';
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-api-'));
    process.env.IMMERSION_DATA_ROOT = dataRoot;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    delete process.env.IMMERSION_DATA_ROOT;
    await fs.rm(dataRoot, { force: true, recursive: true });
  });

  async function writeUserSettings(settings: Record<string, unknown>) {
    await fs.writeFile(path.join(dataRoot, 'user-settings.json'), JSON.stringify(settings, null, 2), 'utf8');
  }

  function mockProviderModelsResponse(payload: unknown, status = 200) {
    const requests: ProviderConnectionRequestRecord[] = [];

    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const headers = new Headers(init?.headers);

      requests.push({
        authorization: headers.get('authorization'),
        url: input instanceof Request ? input.url : input.toString(),
      });

      return new Response(JSON.stringify(payload), {
        headers: {
          'Content-Type': 'application/json',
        },
        status,
      });
    }) as typeof fetch;

    return requests;
  }

  it('reads provider settings from the canonical file-backed source', async () => {
    await writeUserSettings({
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: {
        custom: {
          url: 'http://127.0.0.1:6001',
          apiKey: 'secret',
        },
      },
    });

    const app = buildApiApp();
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

    await app.close();
  });

  it('tests the active external provider models endpoint without exposing secrets', async () => {
    await writeUserSettings({
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: {
        custom: {
          url: 'http://127.0.0.1:6001',
          apiKey: 'secret',
          model: 'existing-model',
        },
      },
    });
    const before = await fs.readFile(path.join(dataRoot, 'user-settings.json'), 'utf8');
    const requests = mockProviderModelsResponse({
      data: [
        {
          id: 'local-model-a',
        },
        {
          id: 'local-model-b',
        },
      ],
    });

    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/providers/connection',
    });
    const payload = ProviderConnectionResponseSchema.parse(response.json());
    const after = await fs.readFile(path.join(dataRoot, 'user-settings.json'), 'utf8');

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
    expect(requests).toEqual([
      {
        authorization: 'Bearer secret',
        url: 'http://127.0.0.1:6001/v1/models',
      },
    ]);
    expect(after).toBe(before);

    await app.close();
  });

  it('does not duplicate the v1 suffix when testing provider models', async () => {
    await writeUserSettings({
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: {
        custom: {
          url: 'http://127.0.0.1:6001/v1',
        },
      },
    });
    const requests = mockProviderModelsResponse({
      data: [
        {
          id: 'model-from-v1-base',
        },
      ],
    });

    const app = buildApiApp();
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
    expect(requests.map((request) => request.url)).toEqual(['http://127.0.0.1:6001/v1/models']);

    await app.close();
  });

  it('returns a typed provider connection issue when the external URL is missing', async () => {
    await writeUserSettings({
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: {
        custom: {
          url: '   ',
        },
      },
    });
    const requests = mockProviderModelsResponse({
      data: [],
    });

    const app = buildApiApp();
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
    expect(requests).toHaveLength(0);

    await app.close();
  });

  it('returns a typed provider connection issue when the external URL is invalid', async () => {
    await writeUserSettings({
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: {
        custom: {
          url: 'not-a-url',
        },
      },
    });
    const requests = mockProviderModelsResponse({
      data: [],
    });

    const app = buildApiApp();
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
    expect(requests).toHaveLength(0);

    await app.close();
  });

  it('returns a typed provider connection issue when the provider responds with HTTP failure', async () => {
    await writeUserSettings({
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: {
        custom: {
          url: 'http://127.0.0.1:6001',
        },
      },
    });
    const requests = mockProviderModelsResponse({ error: 'failed' }, 500);

    const app = buildApiApp();
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
    expect(requests).toHaveLength(1);

    await app.close();
  });

  it('returns a typed provider connection issue when the models payload is invalid', async () => {
    await writeUserSettings({
      backendMode: 'external',
      activeProvider: 'custom',
      providerConfigs: {
        custom: {
          url: 'http://127.0.0.1:6001',
        },
      },
    });
    const requests = mockProviderModelsResponse({
      unexpected: [],
    });

    const app = buildApiApp();
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
    expect(requests).toHaveLength(1);

    await app.close();
  });

  it('returns a typed provider connection issue when builtin runtime is not running', async () => {
    await writeUserSettings({
      backendMode: 'builtin',
      activeProvider: 'custom',
      providerConfigs: {
        custom: {
          url: 'http://127.0.0.1:6001',
        },
      },
    });
    const requests = mockProviderModelsResponse({
      data: [
        {
          id: 'should-not-fetch',
        },
      ],
    });

    const app = buildApiApp();
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
    expect(requests).toHaveLength(0);

    await app.close();
  });

  it('updates provider settings without overwriting unrelated user settings', async () => {
    await writeUserSettings({
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

    const app = buildApiApp();
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

    const stored = JSON.parse(await fs.readFile(path.join(dataRoot, 'user-settings.json'), 'utf8')) as Record<
      string,
      unknown
    >;

    expect(stored.userName).toBe('Misha');
    expect(stored.backendMode).toBe('builtin');
    expect(stored.activeProvider).toBe('custom');
    expect(stored.providerConfigs).toMatchObject({
      custom: {
        url: 'http://127.0.0.1:6001',
        model: 'settings-model',
      },
    });

    await app.close();
  });

  it('falls back to default settings when the canonical source file contains invalid JSON', async () => {
    await fs.writeFile(path.join(dataRoot, 'user-settings.json'), '{ invalid json', 'utf8');

    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/providers/settings',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      mode: 'builtin',
      activeProvider: 'custom',
    });

    await app.close();
  });
});
