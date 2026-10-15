import fs from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { useTestApi } from './test-support/use-test-api.js';

describe('user-settings.json writes', () => {
  const api = useTestApi();

  it('persists concurrent mutations from different modules without losing updates', async () => {
    const { app, settings } = api();
    await settings.write({ userName: 'Misha' });

    const [runtimeResponse, providersResponse] = await Promise.all([
      app.inject({
        method: 'PUT',
        url: '/api/runtime/config',
        payload: {
          modelsDirs: ['models'],
          port: 5010,
          gpuLayers: 12,
          contextSize: 16384,
          flashAttention: true,
          threads: 4,
        },
      }),
      app.inject({
        method: 'PUT',
        url: '/api/providers/settings',
        payload: {
          mode: 'external',
          activeProvider: 'custom',
          providerConfigs: {
            custom: {
              url: 'http://127.0.0.1:9999',
              model: 'concurrent-model',
            },
          },
        },
      }),
    ]);

    expect(runtimeResponse.statusCode).toBe(200);
    expect(providersResponse.statusCode).toBe(200);

    const stored = await settings.read();

    expect(stored.userName).toBe('Misha');
    expect(stored.llmServerConfig).toMatchObject({ port: 5010, gpuLayers: 12 });
    expect(stored.backendMode).toBe('external');
    expect(stored.providerConfigs).toMatchObject({
      custom: { url: 'http://127.0.0.1:9999', model: 'concurrent-model' },
    });
  });

  it('serializes overlapping settings-module mutations', async () => {
    const { app, settings } = api();

    const createResponses = await Promise.all(
      ['Preset A', 'Preset B', 'Preset C'].map((name) =>
        app.inject({
          method: 'POST',
          url: '/api/settings/sampler/presets',
          payload: {
            name,
            contextTrimStrategy: 'trim_middle',
            maxContextLength: 8192,
            maxTokens: 512,
            minP: 0.02,
            presencePenalty: 0,
            repeatPenalty: 1.05,
            repeatPenaltyRange: 2048,
            temperature: 0.9,
            topK: 0,
            topP: 1,
          },
        }),
      ),
    );

    expect(createResponses.map((response) => response.statusCode)).toEqual([201, 201, 201]);

    const stored = await settings.read();
    const names = (stored.samplerPresets ?? []).map((preset) => preset.name).sort();

    expect(names).toEqual(['Preset A', 'Preset B', 'Preset C']);
  });

  it('degrades to defaults instead of failing when user-settings.json is malformed', async () => {
    const { app, settings } = api();
    await fs.writeFile(settings.path, '{ "userName": "Misha", "trunca', 'utf8');

    const settingsResponse = await app.inject({ method: 'GET', url: '/api/settings/overview' });
    expect(settingsResponse.statusCode).toBe(200);
    expect(settingsResponse.json()).toMatchObject({
      profile: { userName: 'User' },
    });

    const runtimeResponse = await app.inject({ method: 'GET', url: '/api/runtime/overview' });
    expect(runtimeResponse.statusCode).toBe(200);

    const readinessResponse = await app.inject({ method: 'GET', url: '/api/generation/readiness' });
    expect(readinessResponse.statusCode).toBe(200);
  });
});
