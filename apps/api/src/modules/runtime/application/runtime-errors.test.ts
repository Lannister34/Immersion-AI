import { describe, expect, it } from 'vitest';

import { RuntimeContextApplyFailedError } from './runtime-errors.js';

describe('RuntimeContextApplyFailedError', () => {
  it('says the model runs again with the previous context when the rollback succeeded', () => {
    const error = new RuntimeContextApplyFailedError({
      previousContextSize: 32_256,
      reason: 'llama-server завершился с кодом 1',
      requestedContextSize: 96_000,
      rollbackFailure: null,
    });

    expect(error.message).toBe(
      'Модель не запустилась с контекстом 96000: llama-server завершился с кодом 1. Она снова работает с прежним контекстом 32256.',
    );
  });

  it('says the rollback failed too, with its reason, instead of claiming the model runs', () => {
    const error = new RuntimeContextApplyFailedError({
      previousContextSize: 32_256,
      reason: 'llama-server завершился с кодом 1',
      requestedContextSize: 96_000,
      rollbackFailure: 'llama-server завершился с кодом 3',
    });

    expect(error.message).toContain(
      'Запустить её с прежним контекстом 32256 тоже не удалось: llama-server завершился с кодом 3.',
    );
    expect(error.message).not.toContain('снова работает');
  });
});
