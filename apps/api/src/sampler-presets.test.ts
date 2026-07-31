import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  DeleteSamplerPresetResponseSchema,
  SamplerPresetMutationResponseSchema,
  SetActiveSamplerPresetResponseSchema,
  SettingsOverviewResponseSchema,
} from '@immersion/contracts/settings';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from './app.js';

const BASE_PRESET = {
  contextTrimStrategy: 'trim_middle' as const,
  maxContextLength: 8192,
  maxTokens: 600,
  minP: 0.02,
  presencePenalty: 0,
  repeatPenalty: 1.05,
  repeatPenaltyRange: 2048,
  temperature: 1,
  topK: 0,
  topP: 1,
};

describe('sampler preset routes', () => {
  let previousDataRoot: string | undefined;
  let temporaryDataRoot: string;

  beforeEach(async () => {
    previousDataRoot = process.env.IMMERSION_DATA_ROOT;
    temporaryDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-sampler-'));
    process.env.IMMERSION_DATA_ROOT = temporaryDataRoot;
    await fs.writeFile(
      path.join(temporaryDataRoot, 'user-settings.json'),
      JSON.stringify({
        userName: 'Tester',
        samplerPresets: [
          { ...encodeStored('default', 'Default'), top_k: 20 },
          encodeStored('mistral-v7-tekken', 'Mistral V7-Tekken'),
        ],
        activePresetId: 'default',
        modelPresetMap: {
          'sandbox.gguf': 'default',
          'cydonia.gguf': 'mistral-v7-tekken',
        },
      }),
    );
  });

  afterEach(async () => {
    if (previousDataRoot) {
      process.env.IMMERSION_DATA_ROOT = previousDataRoot;
    } else {
      delete process.env.IMMERSION_DATA_ROOT;
    }
    await fs.rm(temporaryDataRoot, { recursive: true, force: true });
  });

  it('POST /sampler/presets creates a preset, assigns an id and surfaces it in the overview', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/sampler/presets',
      payload: { ...BASE_PRESET, name: 'Roleplay long', topK: 42, temperature: 0.85 },
    });
    const payload = SamplerPresetMutationResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(201);
    expect(payload.preset.id).toBe('roleplay-long');
    expect(payload.preset.name).toBe('Roleplay long');
    expect(payload.preset.temperature).toBe(0.85);
    expect(payload.sampler.presets.some((preset) => preset.id === 'roleplay-long')).toBe(true);

    const persisted = JSON.parse(
      await fs.readFile(path.join(temporaryDataRoot, 'user-settings.json'), 'utf8'),
    ) as Record<string, unknown>;
    const presets = persisted.samplerPresets as Array<Record<string, unknown>>;
    expect(presets.find((preset) => preset.id === 'roleplay-long')).toMatchObject({
      name: 'Roleplay long',
      temperature: 0.85,
      top_k: 42,
    });

    await app.close();
  });

  it('POST /sampler/presets disambiguates the generated id when the slug already exists', async () => {
    const app = buildApiApp();
    // The seeded fixture already has a "default" preset, so the new one collides on the slug.
    const first = await app.inject({
      method: 'POST',
      url: '/api/settings/sampler/presets',
      payload: { ...BASE_PRESET, name: 'Default' },
    });
    expect(first.statusCode).toBe(201);
    expect(SamplerPresetMutationResponseSchema.parse(first.json()).preset.id).toBe('default-2');

    const second = await app.inject({
      method: 'POST',
      url: '/api/settings/sampler/presets',
      payload: { ...BASE_PRESET, name: 'Default' },
    });
    expect(second.statusCode).toBe(201);
    expect(SamplerPresetMutationResponseSchema.parse(second.json()).preset.id).toBe('default-3');

    await app.close();
  });

  it('PUT /sampler/presets/:presetId rewrites the preset fields and returns the updated overview', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings/sampler/presets/default',
      payload: { ...BASE_PRESET, name: 'Default tuned', temperature: 0.65 },
    });
    const payload = SamplerPresetMutationResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.preset.name).toBe('Default tuned');
    expect(payload.preset.temperature).toBe(0.65);

    const overviewResponse = await app.inject({ method: 'GET', url: '/api/settings/overview' });
    const overview = SettingsOverviewResponseSchema.parse(overviewResponse.json());
    expect(overview.sampler.presets.find((preset) => preset.id === 'default')?.name).toBe('Default tuned');

    await app.close();
  });

  it('PUT /sampler/presets/:presetId returns 404 for a missing preset', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings/sampler/presets/missing',
      payload: { ...BASE_PRESET, name: 'Whatever' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'sampler_preset_not_found' });

    await app.close();
  });

  it('DELETE /sampler/presets/:presetId removes the preset and reassigns active + cleans modelPresetMap', async () => {
    const app = buildApiApp();
    const response = await app.inject({ method: 'DELETE', url: '/api/settings/sampler/presets/default' });
    const payload = DeleteSamplerPresetResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.sampler.presets.some((preset) => preset.id === 'default')).toBe(false);
    expect(payload.sampler.activePresetId).toBe('mistral-v7-tekken');
    expect(payload.sampler.modelBindings.some((binding) => binding.modelName === 'sandbox.gguf')).toBe(false);
    expect(payload.sampler.modelBindings.some((binding) => binding.modelName === 'cydonia.gguf')).toBe(true);

    await app.close();
  });

  it('DELETE /sampler/presets/:presetId refuses to delete the last preset', async () => {
    await fs.writeFile(
      path.join(temporaryDataRoot, 'user-settings.json'),
      JSON.stringify({
        userName: 'Tester',
        samplerPresets: [encodeStored('only', 'Only')],
        activePresetId: 'only',
      }),
    );
    const app = buildApiApp();
    const response = await app.inject({ method: 'DELETE', url: '/api/settings/sampler/presets/only' });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'last_sampler_preset' });

    await app.close();
  });

  it('PUT /sampler/active-preset switches the active preset', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings/sampler/active-preset',
      payload: { presetId: 'mistral-v7-tekken' },
    });
    const payload = SetActiveSamplerPresetResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.sampler.activePresetId).toBe('mistral-v7-tekken');

    await app.close();
  });

  it('PUT /sampler/active-preset returns 404 for an unknown preset', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings/sampler/active-preset',
      payload: { presetId: 'nope' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'sampler_preset_not_found' });

    await app.close();
  });
});

function encodeStored(id: string, name: string) {
  return {
    context_trim_strategy: 'trim_middle' as const,
    id,
    max_context_length: 8192,
    max_length: 600,
    min_p: 0.02,
    name,
    presence_penalty: 0,
    rep_pen: 1.05,
    rep_pen_range: 2048,
    temperature: 1,
    top_k: 0,
    top_p: 1,
  };
}
