import { describe, expect, it } from 'vitest';

import {
  RuntimeBinaryMissingError,
  RuntimeInstallError,
  RuntimeModelNotFoundError,
  RuntimeProjectorNotFoundError,
} from '../../application/runtime-errors.js';
import { PathPickerUnsupportedError } from '../../infrastructure/directory-picker-invocation.js';
import { runtimeProblems } from './runtime-problems.js';

describe('runtimeProblems', () => {
  it('answers a missing model with 400 validation_error naming the path, which the ComfyUI node shows', () => {
    const modelPath = 'D:/Модели/Удалённая-модель-Q4_K_M.gguf';

    expect(runtimeProblems.map(new RuntimeModelNotFoundError(modelPath))).toEqual({
      statusCode: 400,
      body: { code: 'validation_error', message: `Model not found: ${modelPath}` },
    });
  });

  it('answers a missing multimodal projector with 400 validation_error naming the path', () => {
    const projectorPath = 'D:/Модели/mmproj-F16.gguf';

    expect(runtimeProblems.map(new RuntimeProjectorNotFoundError(projectorPath))).toEqual({
      statusCode: 400,
      body: { code: 'validation_error', message: `Multimodal projector not found: ${projectorPath}` },
    });
  });

  it('answers a missing llama-server binary with 409 runtime_unavailable', () => {
    expect(runtimeProblems.map(new RuntimeBinaryMissingError())).toEqual({
      statusCode: 409,
      body: {
        code: 'runtime_unavailable',
        message: 'llama-server не найден. Проверьте bin/ в основном рабочем дереве.',
      },
    });
  });

  it("answers a failed install step with 502 runtime_install_failed and the step's own message, not its cause's", () => {
    const error = new RuntimeInstallError('Не удалось скачать llama-b8766-bin-win-cpu-x64.zip.', {
      cause: new TypeError('fetch failed'),
    });

    expect(runtimeProblems.map(error)).toEqual({
      statusCode: 502,
      body: { code: 'runtime_install_failed', message: 'Не удалось скачать llama-b8766-bin-win-cpu-x64.zip.' },
    });
  });

  it('answers an unsupported directory picker with 501 directory_picker_unsupported', () => {
    expect(runtimeProblems.map(new PathPickerUnsupportedError())).toEqual({
      statusCode: 501,
      body: {
        code: 'directory_picker_unsupported',
        message: 'Системный диалог выбора каталога недоступен на этой платформе — введите путь вручную.',
      },
    });
  });

  it('leaves an error whose message only looks like a runtime one to the unexpected-error path', () => {
    expect(runtimeProblems.map(new Error('llama-server не найден.'))).toBeNull();
    expect(runtimeProblems.map(new Error('Model not found: D:/model.gguf'))).toBeNull();
  });
});
