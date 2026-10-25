import {
  type CreateSamplerPresetCommand,
  DeleteSamplerPresetResponseSchema,
  SamplerPresetMutationResponseSchema,
  SetActiveSamplerPresetResponseSchema,
  SettingsOverviewResponseSchema,
} from '@immersion/contracts/settings';
import { beforeEach, describe, expect, it } from 'vitest';

import { snapshotDataRoot } from './test-support/data-root-snapshot.js';
import { storedSamplerPreset } from './test-support/stored-sampler-preset.js';
import { useTestApi } from './test-support/use-test-api.js';

const BASE_PRESET: CreateSamplerPresetCommand = {
  contextTrimStrategy: 'trim_middle',
  maxContextLength: 8192,
  maxTokens: 600,
  minP: 0.02,
  name: 'Base',
  presencePenalty: 0,
  repeatPenalty: 1.05,
  repeatPenaltyRange: 2048,
  temperature: 1,
  topK: 0,
  topP: 1,
};

describe('sampler preset routes', () => {
  const api = useTestApi();

  beforeEach(async () => {
    await api().settings.write({
      userName: 'Tester',
      samplerPresets: [
        storedSamplerPreset('default', 'Default', { top_k: 20 }),
        storedSamplerPreset('mistral-v7-tekken', 'Mistral V7-Tekken'),
      ],
      activePresetId: 'default',
      modelPresetMap: {
        'sandbox.gguf': 'default',
        'cydonia.gguf': 'mistral-v7-tekken',
      },
    });
  });

  it('POST /sampler/presets creates a preset, assigns an id and surfaces it in the overview', async () => {
    const { app, settings } = api();
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

    const persisted = await settings.read();
    expect(persisted.samplerPresets?.find((preset) => preset.id === 'roleplay-long')).toMatchObject({
      name: 'Roleplay long',
      temperature: 0.85,
      top_k: 42,
    });
  });

  it('POST /sampler/presets disambiguates the generated id when the slug already exists', async () => {
    const { app } = api();
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
  });

  it('POST /sampler/presets drops diacritics from the generated id', async () => {
    const response = await api().app.inject({
      method: 'POST',
      url: '/api/settings/sampler/presets',
      payload: { ...BASE_PRESET, name: 'Crème brûlée' },
    });

    expect(response.statusCode).toBe(201);
    expect(SamplerPresetMutationResponseSchema.parse(response.json()).preset.id).toBe('creme-brulee');
  });

  it('PUT /sampler/presets/:presetId rewrites the preset fields and returns the updated overview', async () => {
    const { app } = api();
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
  });

  it('PUT /sampler/presets/:presetId returns 404 for a missing preset', async () => {
    const response = await api().app.inject({
      method: 'PUT',
      url: '/api/settings/sampler/presets/missing',
      payload: { ...BASE_PRESET, name: 'Whatever' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'sampler_preset_not_found' });
  });

  it('POST /sampler/presets refuses a reply limit equal to the context size and writes nothing', async () => {
    const { app, dataRoot } = api();
    const before = await snapshotDataRoot(dataRoot);
    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/sampler/presets',
      payload: { ...BASE_PRESET, maxContextLength: 32_768, maxTokens: 32_768, name: 'Ролевая длинная' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: 'reply_limit_exceeds_context',
      message:
        'Лимит ответа (32768) должен быть меньше размера контекста (32768): иначе в промпт попадает только последнее сообщение.',
    });
    expect(await snapshotDataRoot(dataRoot)).toEqual(before);
  });

  it('PUT /sampler/presets/:presetId refuses a reply limit above the context size and writes nothing', async () => {
    const { app, dataRoot } = api();
    const before = await snapshotDataRoot(dataRoot);
    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings/sampler/presets/default',
      payload: { ...BASE_PRESET, maxContextLength: 4096, maxTokens: 4097, name: 'Ночная смена' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'reply_limit_exceeds_context' });
    expect(await snapshotDataRoot(dataRoot)).toEqual(before);
  });

  it('keeps a stored preset whose reply limit reaches the context readable, and lets it be repaired', async () => {
    const { app, settings } = api();
    await settings.write({
      activePresetId: 'dolgiy',
      samplerPresets: [
        storedSamplerPreset('dolgiy', 'Долгий разговор', { max_context_length: 32_768, max_length: 32_768 }),
      ],
      userName: 'Тестер',
    });
    const overviewResponse = await app.inject({ method: 'GET', url: '/api/settings/overview' });
    const overview = SettingsOverviewResponseSchema.parse(overviewResponse.json());

    expect(overviewResponse.statusCode).toBe(200);
    expect(overview.sampler.presets).toEqual([
      expect.objectContaining({ id: 'dolgiy', maxContextLength: 32_768, maxTokens: 32_768, name: 'Долгий разговор' }),
    ]);

    const repairResponse = await app.inject({
      method: 'PUT',
      url: '/api/settings/sampler/presets/dolgiy',
      payload: { ...BASE_PRESET, maxContextLength: 32_768, maxTokens: 1024, name: 'Долгий разговор' },
    });

    expect(repairResponse.statusCode).toBe(200);
    expect(SamplerPresetMutationResponseSchema.parse(repairResponse.json()).preset.maxTokens).toBe(1024);
  });

  it('DELETE /sampler/presets/:presetId removes the preset and reassigns active + cleans modelPresetMap', async () => {
    const response = await api().app.inject({ method: 'DELETE', url: '/api/settings/sampler/presets/default' });
    const payload = DeleteSamplerPresetResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.sampler.presets.some((preset) => preset.id === 'default')).toBe(false);
    expect(payload.sampler.activePresetId).toBe('mistral-v7-tekken');
    expect(payload.sampler.modelBindings.some((binding) => binding.modelName === 'sandbox.gguf')).toBe(false);
    expect(payload.sampler.modelBindings.some((binding) => binding.modelName === 'cydonia.gguf')).toBe(true);
  });

  it('DELETE /sampler/presets/:presetId refuses to delete the last preset', async () => {
    const { app, logs, settings } = api();
    await settings.write({
      userName: 'Tester',
      samplerPresets: [storedSamplerPreset('only', 'Only')],
      activePresetId: 'only',
    });
    const response = await app.inject({ method: 'DELETE', url: '/api/settings/sampler/presets/only' });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: 'last_sampler_preset', message: 'Cannot delete the last sampler preset.' });
    expect(logs.lines).toContainEqual(
      expect.objectContaining({ code: 'last_sampler_preset', level: 'info', statusCode: 409 }),
    );
    expect(logs.lines.filter((line) => line.level === 'error')).toEqual([]);
  });

  it('PUT /sampler/active-preset switches the active preset', async () => {
    const response = await api().app.inject({
      method: 'PUT',
      url: '/api/settings/sampler/active-preset',
      payload: { presetId: 'mistral-v7-tekken' },
    });
    const payload = SetActiveSamplerPresetResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.sampler.activePresetId).toBe('mistral-v7-tekken');
  });

  it('PUT /sampler/active-preset returns 404 for an unknown preset', async () => {
    const response = await api().app.inject({
      method: 'PUT',
      url: '/api/settings/sampler/active-preset',
      payload: { presetId: 'nope' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'sampler_preset_not_found', message: 'Sampler preset not found: nope' });
  });

  it('PUT /sampler/active-preset rejects a non-string preset id with 400 validation_error', async () => {
    const { app, dataRoot } = api();
    const before = await snapshotDataRoot(dataRoot);
    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings/sampler/active-preset',
      payload: { presetId: 42 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_error' });
    expect(await snapshotDataRoot(dataRoot)).toEqual(before);
  });
});
