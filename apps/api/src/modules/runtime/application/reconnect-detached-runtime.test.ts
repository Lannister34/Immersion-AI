import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createCapturingLogger } from '../../../test-support/capturing-logger.js';
import { FakeRuntimeProcess } from '../../../test-support/fake-runtime-process.js';
import { reconnectDetachedRuntime } from './reconnect-detached-runtime.js';

const MODELS_DIR = path.join('D:', 'Модели');

describe('reconnectDetachedRuntime', () => {
  it('logs the runtime state it found, idle when no previous API process left a llama-server behind', async () => {
    const { logger, lines } = createCapturingLogger();
    const runtimeProcess = new FakeRuntimeProcess({ defaultModelsDir: MODELS_DIR });

    await reconnectDetachedRuntime({ logger, runtimeProcess });

    expect(runtimeProcess.reconnects).toBe(1);
    expect(lines).toEqual([
      expect.objectContaining({
        level: 'info',
        model: null,
        msg: 'llm-process: reconnect finished',
        pid: null,
        status: 'idle',
      }),
    ]);
  });

  it('logs a failed reconnect and resolves, so the API keeps serving', async () => {
    const runtimeProcess = new FakeRuntimeProcess({ defaultModelsDir: MODELS_DIR });
    vi.spyOn(runtimeProcess, 'reconnect').mockRejectedValueOnce(
      new Error('EACCES: permission denied, open .llm-server.json'),
    );
    const { logger, lines } = createCapturingLogger();

    await expect(reconnectDetachedRuntime({ logger, runtimeProcess })).resolves.toBeUndefined();
    expect(lines).toEqual([
      expect.objectContaining({
        err: expect.objectContaining({ message: 'EACCES: permission denied, open .llm-server.json' }),
        level: 'error',
        msg: 'llm-process: reconnect error',
      }),
    ]);
  });
});
