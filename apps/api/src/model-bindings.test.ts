import { ModelBindingMutationResponseSchema } from '@immersion/contracts/settings';
import { beforeEach, describe, expect, it } from 'vitest';

import { storedSamplerPreset } from './test-support/stored-sampler-preset.js';
import { useTestApi } from './test-support/use-test-api.js';

describe('model binding routes', () => {
  const api = useTestApi();

  beforeEach(async () => {
    await api().settings.write({
      userName: 'Tester',
      samplerPresets: [
        storedSamplerPreset('default', 'Default'),
        storedSamplerPreset('mistral-v7-tekken', 'Mistral V7-Tekken'),
      ],
      activePresetId: 'default',
      modelPresetMap: {
        'sandbox.gguf': 'default',
      },
    });
  });

  it('PUT /bindings/:modelName upserts a model → preset binding and returns the refreshed sampler overview', async () => {
    const { app, settings } = api();
    const response = await app.inject({
      method: 'PUT',
      url: `/api/settings/sampler/bindings/${encodeURIComponent('cydonia.gguf')}`,
      payload: { presetId: 'mistral-v7-tekken' },
    });
    const payload = ModelBindingMutationResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    const cydonia = payload.sampler.modelBindings.find((binding) => binding.modelName === 'cydonia.gguf');
    expect(cydonia?.presetId).toBe('mistral-v7-tekken');

    const persisted = await settings.read();
    expect(persisted.modelPresetMap).toEqual({ 'cydonia.gguf': 'mistral-v7-tekken', 'sandbox.gguf': 'default' });
  });

  it('PUT /bindings/:modelName overwrites an existing binding when the model already has one', async () => {
    const response = await api().app.inject({
      method: 'PUT',
      url: `/api/settings/sampler/bindings/${encodeURIComponent('sandbox.gguf')}`,
      payload: { presetId: 'mistral-v7-tekken' },
    });
    const payload = ModelBindingMutationResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.sampler.modelBindings.find((binding) => binding.modelName === 'sandbox.gguf')?.presetId).toBe(
      'mistral-v7-tekken',
    );
  });

  it('PUT /bindings/:modelName returns 404 when the preset does not exist', async () => {
    const response = await api().app.inject({
      method: 'PUT',
      url: `/api/settings/sampler/bindings/${encodeURIComponent('cydonia.gguf')}`,
      payload: { presetId: 'no-such-preset' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'sampler_preset_not_found' });
  });

  it('DELETE /bindings/:modelName removes the binding from the overview and on disk', async () => {
    const { app, settings } = api();
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/settings/sampler/bindings/${encodeURIComponent('sandbox.gguf')}`,
    });
    const payload = ModelBindingMutationResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.sampler.modelBindings.some((binding) => binding.modelName === 'sandbox.gguf')).toBe(false);

    const persisted = await settings.read();
    expect(persisted.modelPresetMap?.['sandbox.gguf']).toBeUndefined();
  });

  it('DELETE /bindings/:modelName returns 404 for an unknown model', async () => {
    const response = await api().app.inject({
      method: 'DELETE',
      url: `/api/settings/sampler/bindings/${encodeURIComponent('never-bound.gguf')}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'model_binding_not_found' });
  });
});
