import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCapturingLogger } from '../test-support/capturing-logger.js';
import { createDeferred } from '../test-support/deferred.js';
import { type ClosableApi, registerShutdownSignals } from './register-shutdown-signals.js';

const DEADLINE_MS = 5_000;

function setUpShutdown(close: ClosableApi['close']) {
  const { logger, lines } = createCapturingLogger();
  const app = { close: vi.fn<ClosableApi['close']>(close), log: logger };
  const signals = new EventEmitter();
  const exit = vi.fn<(code: number) => void>();
  const exited = createDeferred<number>();

  exit.mockImplementation((code) => exited.resolve(code));
  registerShutdownSignals(app, { deadlineMs: DEADLINE_MS, exit, signals });

  return { app, exit, exited: exited.promise, lines, signals };
}

describe('registerShutdownSignals', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['SIGINT', 'SIGTERM'] as const)('closes the app and exits 0 on %s', async (signal) => {
    const { app, exit, exited, lines, signals } = setUpShutdown(async () => undefined);

    signals.emit(signal);

    await expect(exited).resolves.toBe(0);
    expect(app.close).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
    expect(lines).toContainEqual(expect.objectContaining({ level: 'info', msg: 'API shutting down', signal }));
  });

  it('does not close the app before a signal arrives', () => {
    const { app, exit } = setUpShutdown(async () => undefined);

    expect(app.close).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it('exits 1 when closing rejects', async () => {
    const { exited, lines, signals } = setUpShutdown(async () => {
      throw new Error('onClose hook failed');
    });

    signals.emit('SIGTERM');

    await expect(exited).resolves.toBe(1);
    expect(lines).toContainEqual(
      expect.objectContaining({
        err: expect.objectContaining({ message: 'onClose hook failed' }),
        level: 'error',
        msg: 'API failed to close',
      }),
    );
  });

  it('exits 1 when closing exceeds the deadline', async () => {
    vi.useFakeTimers();
    const { exit, lines, signals } = setUpShutdown(() => new Promise<never>(() => undefined));

    signals.emit('SIGTERM');
    await vi.advanceTimersByTimeAsync(DEADLINE_MS - 1);

    expect(exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(lines).toContainEqual(
      expect.objectContaining({
        deadlineMs: DEADLINE_MS,
        level: 'error',
        msg: 'API did not close before the shutdown deadline',
      }),
    );
  });

  it('leaves no deadline timer pending after a clean close', async () => {
    vi.useFakeTimers();
    const { exited, signals } = setUpShutdown(async () => undefined);

    signals.emit('SIGTERM');

    await expect(exited).resolves.toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closes once when a second signal arrives while the first close is still running', async () => {
    const closing = createDeferred();
    const { app, exit, exited, signals } = setUpShutdown(() => closing.promise);

    signals.emit('SIGINT');
    signals.emit('SIGTERM');
    closing.resolve();

    await expect(exited).resolves.toBe(0);
    expect(app.close).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
  });
});
