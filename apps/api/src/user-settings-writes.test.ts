import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from './app.js';

describe('user-settings.json writes', () => {
  let dataRoot = '';

  beforeEach(async () => {
    dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-settings-'));
    process.env.IMMERSION_DATA_ROOT = dataRoot;
  });

  afterEach(async () => {
    delete process.env.IMMERSION_DATA_ROOT;
    await fs.rm(dataRoot, { force: true, recursive: true });
  });

  it('persists concurrent mutations from different modules without losing updates', async () => {
    await fs.writeFile(
      path.join(dataRoot, 'user-settings.json'),
      JSON.stringify({ userName: 'Misha' }, null, 2),
      'utf8',
    );

    const app = buildApiApp();
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

    const stored = JSON.parse(await fs.readFile(path.join(dataRoot, 'user-settings.json'), 'utf8')) as Record<
      string,
      unknown
    >;

    expect(stored.userName).toBe('Misha');
    expect(stored.llmServerConfig).toMatchObject({ port: 5010, gpuLayers: 12 });
    expect(stored.backendMode).toBe('external');
    expect(stored.providerConfigs).toMatchObject({
      custom: { url: 'http://127.0.0.1:9999', model: 'concurrent-model' },
    });

    await app.close();
  });

  it('serializes overlapping settings-module mutations', async () => {
    const app = buildApiApp();

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

    for (const response of createResponses) {
      expect(response.statusCode).toBe(201);
    }

    const stored = JSON.parse(await fs.readFile(path.join(dataRoot, 'user-settings.json'), 'utf8')) as {
      samplerPresets: Array<{ name: string }>;
    };
    const names = stored.samplerPresets.map((preset) => preset.name).sort();

    expect(names).toEqual(['Preset A', 'Preset B', 'Preset C']);

    await app.close();
  });

  it('degrades to defaults instead of failing when user-settings.json is malformed', async () => {
    await fs.writeFile(path.join(dataRoot, 'user-settings.json'), '{ "userName": "Misha", "trunca', 'utf8');

    const app = buildApiApp();

    const settingsResponse = await app.inject({ method: 'GET', url: '/api/settings/overview' });
    expect(settingsResponse.statusCode).toBe(200);
    expect(settingsResponse.json()).toMatchObject({
      profile: { userName: 'User' },
    });

    const runtimeResponse = await app.inject({ method: 'GET', url: '/api/runtime/overview' });
    expect(runtimeResponse.statusCode).toBe(200);

    const readinessResponse = await app.inject({ method: 'GET', url: '/api/generation/readiness' });
    expect(readinessResponse.statusCode).toBe(200);

    await app.close();
  });
});
