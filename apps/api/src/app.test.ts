import { fileURLToPath, URL } from 'node:url';

import { HealthResponseSchema } from '@immersion/contracts';
import { ProvidersOverviewResponseSchema } from '@immersion/contracts/providers';
import { RuntimeOverviewResponseSchema } from '@immersion/contracts/runtime';
import { SettingsOverviewResponseSchema } from '@immersion/contracts/settings';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from './app.js';

const fixtureDataRoot = fileURLToPath(new URL('../testdata/smoke-data', import.meta.url));

describe('buildApiApp', () => {
  let previousDataRoot: string | undefined;

  beforeEach(() => {
    previousDataRoot = process.env.IMMERSION_DATA_ROOT;
    process.env.IMMERSION_DATA_ROOT = fixtureDataRoot;
  });

  afterEach(() => {
    if (previousDataRoot) {
      process.env.IMMERSION_DATA_ROOT = previousDataRoot;
      return;
    }

    delete process.env.IMMERSION_DATA_ROOT;
  });

  it('serves the health contract', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(HealthResponseSchema.parse(response.json())).toMatchObject({
      service: 'api',
      status: 'ok',
    });

    await app.close();
  });

  it('redirects the API root to the web chat route', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      headers: {
        host: '192.168.31.216:4787',
      },
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('http://192.168.31.216:4788/chat');

    await app.close();
  });

  it('serves the settings overview contract from canonical files', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/settings/overview',
    });
    const overview = SettingsOverviewResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(overview).toMatchObject({
      profile: {
        userName: 'Тестер',
        uiLanguage: 'ru',
      },
      sampler: {
        activePresetId: 'default',
        modelBindingCount: 2,
      },
    });
    expect(overview.sampler.modelBindings).toEqual([
      {
        modelName: 'sandbox.gguf',
        presetId: 'default',
      },
      {
        modelName: 'smoke-model',
        presetId: 'smoke-model-preset',
      },
    ]);
    expect(overview.sampler.presets.find((preset) => preset.id === 'default')).toMatchObject({
      maxTokens: 640,
      temperature: 0.72,
      topP: 0.91,
    });
    expect(overview.sampler.presets.find((preset) => preset.id === 'smoke-model-preset')).toMatchObject({
      maxTokens: 777,
      temperature: 0.44,
      topP: 0.82,
    });

    await app.close();
  });

  it('serves the providers overview contract from canonical files', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/providers/overview',
    });
    const overview = ProvidersOverviewResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(overview.activeProvider).toBe('custom');
    expect(overview.backendMode).toBe('external');
    expect(overview.providerConfigs).toHaveLength(2);

    await app.close();
  });

  it('accepts multi-megabyte character card imports instead of rejecting with 413', async () => {
    const app = buildApiApp();
    // ~2 MiB of base64 payload: over Fastify's 1 MiB default body limit, under ours.
    const contentBase64 = 'QUFB'.repeat(700_000);
    const response = await app.inject({
      method: 'POST',
      url: '/api/characters/import',
      payload: {
        contentBase64,
        fileName: 'card.png',
      },
    });

    // Not a valid PNG card, so the domain rejects it — but the transport must not 413.
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'invalid_character_card',
    });

    await app.close();
  });

  it('serves the runtime overview contract with scanned models', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/runtime/overview',
    });
    const overview = RuntimeOverviewResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(overview.serverConfig.port).toBe(5001);
    expect(overview.serverStatus.status).toBe('idle');
    expect(overview.models.map((model) => model.name)).toEqual(['nested/secondary.gguf', 'sandbox.gguf']);

    await app.close();
  });
});
