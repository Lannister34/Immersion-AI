import { describe, expect, it } from 'vitest';

import { createCapturingLogger } from '../test-support/capturing-logger.js';
import { createBuiltinTokenizeTargetResolver } from './resolve-builtin-tokenize-target.js';

const RUNNING_SERVER = { baseUrl: 'http://127.0.0.1:5001', model: 'qwen3-8b', visionProjectorPath: null };

describe('createBuiltinTokenizeTargetResolver', () => {
  it('targets the running built-in server in builtin mode', async () => {
    const resolve = createBuiltinTokenizeTargetResolver({
      log: createCapturingLogger().logger,
      providers: { getProviderSettings: () => Promise.resolve({ mode: 'builtin' }) },
      runtime: { getRunningRuntimeEndpoint: () => Promise.resolve(RUNNING_SERVER) },
    });

    await expect(resolve()).resolves.toEqual({ baseUrl: 'http://127.0.0.1:5001', model: 'qwen3-8b' });
  });

  it('has no target for an external provider or a stopped built-in server', async () => {
    const external = createBuiltinTokenizeTargetResolver({
      log: createCapturingLogger().logger,
      providers: { getProviderSettings: () => Promise.resolve({ mode: 'external' }) },
      runtime: { getRunningRuntimeEndpoint: () => Promise.resolve(RUNNING_SERVER) },
    });
    const stopped = createBuiltinTokenizeTargetResolver({
      log: createCapturingLogger().logger,
      providers: { getProviderSettings: () => Promise.resolve({ mode: 'builtin' }) },
      runtime: { getRunningRuntimeEndpoint: () => Promise.resolve(null) },
    });

    await expect(external()).resolves.toBeNull();
    await expect(stopped()).resolves.toBeNull();
  });

  it('logs a failed lookup and falls back to no target', async () => {
    const { lines, logger } = createCapturingLogger();
    const resolve = createBuiltinTokenizeTargetResolver({
      log: logger,
      providers: { getProviderSettings: () => Promise.resolve({ mode: 'builtin' }) },
      runtime: { getRunningRuntimeEndpoint: () => Promise.reject(new Error('PID file unreadable')) },
    });

    await expect(resolve()).resolves.toBeNull();
    expect(lines).toEqual([
      expect.objectContaining({
        err: expect.objectContaining({ message: 'PID file unreadable' }),
        level: 'warn',
        msg: 'Tokenize target unavailable; counting tokens approximately',
      }),
    ]);
  });
});
