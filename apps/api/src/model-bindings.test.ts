import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ModelBindingMutationResponseSchema } from '@immersion/contracts/settings';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from './app.js';

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

describe('model binding routes', () => {
  let previousDataRoot: string | undefined;
  let temporaryDataRoot: string;

  beforeEach(async () => {
    previousDataRoot = process.env.IMMERSION_DATA_ROOT;
    temporaryDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-bindings-'));
    process.env.IMMERSION_DATA_ROOT = temporaryDataRoot;
    await fs.writeFile(
      path.join(temporaryDataRoot, 'user-settings.json'),
      JSON.stringify({
        userName: 'Tester',
        samplerPresets: [encodeStored('default', 'Default'), encodeStored('mistral-v7-tekken', 'Mistral V7-Tekken')],
        activePresetId: 'default',
        modelPresetMap: {
          'sandbox.gguf': 'default',
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

  it('PUT /bindings/:modelName upserts a model → preset binding and returns the refreshed sampler overview', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'PUT',
      url: `/api/settings/sampler/bindings/${encodeURIComponent('cydonia.gguf')}`,
      payload: { presetId: 'mistral-v7-tekken' },
    });
    const payload = ModelBindingMutationResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    const cydonia = payload.sampler.modelBindings.find((binding) => binding.modelName === 'cydonia.gguf');
    expect(cydonia?.presetId).toBe('mistral-v7-tekken');

    const persisted = JSON.parse(
      await fs.readFile(path.join(temporaryDataRoot, 'user-settings.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect((persisted.modelPresetMap as Record<string, string>)['cydonia.gguf']).toBe('mistral-v7-tekken');
    expect((persisted.modelPresetMap as Record<string, string>)['sandbox.gguf']).toBe('default');

    await app.close();
  });

  it('PUT /bindings/:modelName overwrites an existing binding when the model already has one', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'PUT',
      url: `/api/settings/sampler/bindings/${encodeURIComponent('sandbox.gguf')}`,
      payload: { presetId: 'mistral-v7-tekken' },
    });
    const payload = ModelBindingMutationResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.sampler.modelBindings.find((binding) => binding.modelName === 'sandbox.gguf')?.presetId).toBe(
      'mistral-v7-tekken',
    );

    await app.close();
  });

  it('PUT /bindings/:modelName returns 404 when the preset does not exist', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'PUT',
      url: `/api/settings/sampler/bindings/${encodeURIComponent('cydonia.gguf')}`,
      payload: { presetId: 'no-such-preset' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'sampler_preset_not_found' });

    await app.close();
  });

  it('DELETE /bindings/:modelName removes the binding from the overview and on disk', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/settings/sampler/bindings/${encodeURIComponent('sandbox.gguf')}`,
    });
    const payload = ModelBindingMutationResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.sampler.modelBindings.some((binding) => binding.modelName === 'sandbox.gguf')).toBe(false);

    const persisted = JSON.parse(
      await fs.readFile(path.join(temporaryDataRoot, 'user-settings.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect((persisted.modelPresetMap as Record<string, string>)['sandbox.gguf']).toBeUndefined();

    await app.close();
  });

  it('DELETE /bindings/:modelName returns 404 for an unknown model', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/settings/sampler/bindings/${encodeURIComponent('never-bound.gguf')}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'model_binding_not_found' });

    await app.close();
  });
});
