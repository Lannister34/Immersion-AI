import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { pairVisionProjectors } from './vision-projector-pairing.js';

function filesIn(directory: string, names: string[]) {
  return names.map((name) => ({ containingDirectory: directory, path: path.join(directory, name) }));
}

function projectorByModel(files: ReturnType<typeof filesIn>) {
  return Object.fromEntries(
    pairVisionProjectors(files).map((model) => [
      path.basename(model.path),
      model.visionProjectorPath ? path.basename(model.visionProjectorPath) : null,
    ]),
  );
}

describe('vision projector pairing', () => {
  it('leaves projectors out of the returned model list', () => {
    const models = pairVisionProjectors(
      filesIn('/m', ['Qwen-VL-Q4_K_M.gguf', 'mmproj-Qwen-VL-f16.gguf', 'Qwen-VL.MMPROJ-Q8_0.gguf']),
    );

    expect(models.map((model) => path.basename(model.path))).toEqual(['Qwen-VL-Q4_K_M.gguf']);
  });

  it('gives a named projector only to the model it names when unrelated models share the folder', () => {
    expect(
      projectorByModel(
        filesIn('/m', [
          'Llama-3-8B-Q4_K_M.gguf',
          'Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf',
          'mmproj-Qwen2.5-VL-7B-Instruct-f16.gguf',
        ]),
      ),
    ).toEqual({
      'Llama-3-8B-Q4_K_M.gguf': null,
      'Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf': 'mmproj-Qwen2.5-VL-7B-Instruct-f16.gguf',
    });
  });

  it('keeps two model families in one folder on their own projectors', () => {
    expect(
      projectorByModel(
        filesIn('/m/vision', [
          'gemma-3-27b-it-Q4_K_M.gguf',
          'mmproj-gemma-3-27b-it-f16.gguf',
          'Qwen2.5-VL-7B-Q8_0.gguf',
          'mmproj-Qwen2.5-VL-7B-f16.gguf',
        ]),
      ),
    ).toEqual({
      'gemma-3-27b-it-Q4_K_M.gguf': 'mmproj-gemma-3-27b-it-f16.gguf',
      'Qwen2.5-VL-7B-Q8_0.gguf': 'mmproj-Qwen2.5-VL-7B-f16.gguf',
    });
  });

  it('shares a generically named projector across quants of the one model in its folder', () => {
    expect(
      projectorByModel(filesIn('/m/qwen-vl', ['Qwen-VL-Q4_K_M.gguf', 'Qwen-VL-Q8_0.gguf', 'mmproj-F16.gguf'])),
    ).toEqual({
      'Qwen-VL-Q4_K_M.gguf': 'mmproj-F16.gguf',
      'Qwen-VL-Q8_0.gguf': 'mmproj-F16.gguf',
    });
  });

  it('gives a generically named projector to nobody when the folder holds different models', () => {
    expect(
      projectorByModel(filesIn('/m', ['Llama-3-8B-Q4_K_M.gguf', 'Qwen-VL-Q4_K_M.gguf', 'mmproj-model-f16.gguf'])),
    ).toEqual({
      'Llama-3-8B-Q4_K_M.gguf': null,
      'Qwen-VL-Q4_K_M.gguf': null,
    });
  });

  it('does not hand a stray named projector to a different model', () => {
    expect(projectorByModel(filesIn('/m', ['Llama-3-8B-Q4_K_M.gguf', 'mmproj-Qwen-VL-f16.gguf']))).toEqual({
      'Llama-3-8B-Q4_K_M.gguf': null,
    });
  });

  it('matches the dotted mmproj naming used by some quantizers', () => {
    expect(projectorByModel(filesIn('/m', ['Foo-12B.Q8_0.gguf', 'Foo-12B.mmproj-f16.gguf']))).toEqual({
      'Foo-12B.Q8_0.gguf': 'Foo-12B.mmproj-f16.gguf',
    });
  });

  it('never borrows a projector from a sibling folder', () => {
    const files = [
      ...filesIn('/m/vl', ['Qwen-VL-Q4_K_M.gguf', 'mmproj-F16.gguf']),
      ...filesIn('/m/text', ['Qwen-VL-Q8_0.gguf']),
    ];

    expect(projectorByModel(files)).toEqual({
      'Qwen-VL-Q4_K_M.gguf': 'mmproj-F16.gguf',
      'Qwen-VL-Q8_0.gguf': null,
    });
  });
});
