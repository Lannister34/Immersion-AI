import { fileURLToPath, URL } from 'node:url';

import { HealthResponseSchema } from '@immersion/contracts';
import { ImportChatCommandSchema } from '@immersion/contracts/chats';
import { ProvidersOverviewResponseSchema } from '@immersion/contracts/providers';
import { RuntimeOverviewResponseSchema } from '@immersion/contracts/runtime';
import { SettingsOverviewResponseSchema } from '@immersion/contracts/settings';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from './app.js';
import { type ApiDependencyOverrides, createApiDependencies } from './composition/api-dependencies.js';
import { parseApiConfig } from './config/api-config.js';
import { findProjectRoot } from './config/find-project-root.js';
import { createCapturingLogger } from './test-support/capturing-logger.js';

const fixtureDataRoot = fileURLToPath(new URL('../testdata/smoke-data', import.meta.url));

function buildConfiguredApp(environment: Record<string, string>, overrides: ApiDependencyOverrides = {}) {
  const config = parseApiConfig(
    { IMMERSION_DATA_ROOT: fixtureDataRoot, ...environment },
    findProjectRoot(import.meta.dirname),
  );

  return buildApiApp(createApiDependencies(config, overrides));
}

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

  it('redirects the API root to the configured web port', async () => {
    const app = buildConfiguredApp({ IMMERSION_WEB_PORT: '5173' });
    const response = await app.inject({
      headers: {
        host: '127.0.0.1:4787',
      },
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('http://127.0.0.1:5173/chat');

    await app.close();
  });

  it('allows cross-origin calls from the configured web origins only', async () => {
    const app = buildConfiguredApp({ IMMERSION_WEB_PORT: '5173' });
    const allowed = await app.inject({
      headers: { origin: 'http://127.0.0.1:5173' },
      method: 'GET',
      url: '/health',
    });
    const refused = await app.inject({
      headers: { origin: 'http://127.0.0.1:4173' },
      method: 'GET',
      url: '/health',
    });

    expect(allowed.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
    expect(refused.headers['access-control-allow-origin']).toBeUndefined();

    await app.close();
  });

  it('stamps /health with the injected clock', async () => {
    const app = buildConfiguredApp({}, { clock: { now: () => new Date('2026-10-15T09:30:00.000Z') } });
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(HealthResponseSchema.parse(response.json()).timestamp).toBe('2026-10-15T09:30:00.000Z');

    await app.close();
  });

  it('answers /health with and without a trailing slash, as before the system module', async () => {
    const app = buildConfiguredApp({});
    const responses = await Promise.all(['/health', '/health/'].map((url) => app.inject({ method: 'GET', url })));

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);

    await app.close();
  });

  it('logs requests through the injected logger, so one logger serves the whole app', async () => {
    const { logger, lines } = createCapturingLogger();
    const app = buildConfiguredApp({ IMMERSION_LOG_LEVEL: 'silent' }, { logger });

    await app.inject({ method: 'GET', url: '/health' });

    expect(lines).toContainEqual(expect.objectContaining({ level: 'info', msg: 'request completed' }));

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

  it('serves the providers overview from canonical files with a config for every catalog provider, cloud ones included', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/providers/overview',
    });
    const overview = ProvidersOverviewResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(overview.activeProvider).toBe('custom');
    expect(overview.backendMode).toBe('external');
    expect(overview.providerConfigs.map((config) => config.provider).sort()).toEqual([
      'anthropic',
      'custom',
      'koboldcpp',
      'openai',
    ]);

    await app.close();
  });

  it('passes a character card import over the 1 MiB Fastify default body limit to the domain instead of rejecting it with 413', async () => {
    const app = buildApiApp();
    const contentBase64 = 'QUFB'.repeat(700_000);
    const response = await app.inject({
      method: 'POST',
      url: '/api/characters/import',
      payload: {
        contentBase64,
        fileName: 'card.png',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'invalid_character_card',
    });

    await app.close();
  });

  it('accepts a body as large as the largest contract payload, so an oversized chat import gets its own 413', async () => {
    const app = buildApiApp();
    const largestContentBase64 = 'A'.repeat(ImportChatCommandSchema.shape.contentBase64.maxLength ?? 0);

    const response = await app.inject({
      method: 'POST',
      url: '/api/chats/import',
      payload: { contentBase64: largestContentBase64 },
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ code: 'chat_file_too_large' });

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
