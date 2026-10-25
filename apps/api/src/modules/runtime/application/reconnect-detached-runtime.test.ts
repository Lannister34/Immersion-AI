import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCapturingLogger } from '../../../test-support/capturing-logger.js';
import { LlmProcessManager } from '../infrastructure/llm-process-manager.js';
import { reconnectDetachedRuntime } from './reconnect-detached-runtime.js';

describe('reconnectDetachedRuntime', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the runtime state it found, idle when no previous API process left a llama-server behind', async () => {
    const { logger, lines } = createCapturingLogger();

    await reconnectDetachedRuntime(logger);

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
    vi.spyOn(LlmProcessManager.prototype, 'reconnectToDetachedRuntime').mockRejectedValueOnce(
      new Error('EACCES: permission denied, open .llm-server.json'),
    );
    const { logger, lines } = createCapturingLogger();

    await expect(reconnectDetachedRuntime(logger)).resolves.toBeUndefined();
    expect(lines).toEqual([
      expect.objectContaining({
        err: expect.objectContaining({ message: 'EACCES: permission denied, open .llm-server.json' }),
        level: 'error',
        msg: 'llm-process: reconnect error',
      }),
    ]);
  });
});
