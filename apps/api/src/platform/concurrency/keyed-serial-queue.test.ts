import { describe, expect, it } from 'vitest';

import { createDeferred } from '../../test-support/deferred.js';
import { captureNextUnhandledRejection } from '../../test-support/unhandled-rejection-capture.js';
import { createKeyedSerialQueue } from './keyed-serial-queue.js';

describe('createKeyedSerialQueue', () => {
  it('runs operations on one key in submission order', async () => {
    const queue = createKeyedSerialQueue<string>();
    const log: string[] = [];
    const firstGate = createDeferred();
    const firstStarted = createDeferred();

    const first = queue.run('chat-a', async () => {
      log.push('start first');
      firstStarted.resolve();
      await firstGate.promise;
      log.push('end first');
    });
    const second = queue.run('chat-a', async () => {
      log.push('start second');
    });

    await firstStarted.promise;
    expect(log).toEqual(['start first']);

    firstGate.resolve();
    await Promise.all([first, second]);
    expect(log).toEqual(['start first', 'end first', 'start second']);
  });

  it('different keys run independently', async () => {
    const queue = createKeyedSerialQueue<string>();
    const blocker = createDeferred();

    const blocked = queue.run('chat-a', async () => {
      await blocker.promise;

      return 'chat-a done';
    });

    await expect(queue.run('chat-b', async () => 'chat-b done')).resolves.toBe('chat-b done');

    blocker.resolve();
    await expect(blocked).resolves.toBe('chat-a done');
  });

  it('a rejected operation does not block the next on its key', async () => {
    const queue = createKeyedSerialQueue<string>();
    const failure = new Error('chat write failed');

    const failed = queue.run('chat-a', async () => {
      throw failure;
    });
    const next = queue.run('chat-a', async () => 'next ran');

    await expect(failed).rejects.toBe(failure);
    await expect(next).resolves.toBe('next ran');
  });

  it('a rejection whose caller dropped the promise still surfaces as an unhandled rejection', async () => {
    const unhandled = captureNextUnhandledRejection();
    const failure = new Error('dropped by its caller');

    void createKeyedSerialQueue<string>().run('chat-a', async () => {
      throw failure;
    });

    await expect(unhandled).resolves.toBe(failure);
  });

  it('drops a key once its queue is idle, whether its last operation resolved or rejected', async () => {
    const queue = createKeyedSerialQueue<string>();
    const gate = createDeferred();
    expect(queue.activeKeyCount).toBe(0);

    const first = queue.run('chat-a', async () => {
      await gate.promise;
    });
    const second = queue.run('chat-a', async () => {
      throw new Error('rejected last operation');
    });
    const other = queue.run('chat-b', async () => undefined);
    expect(queue.activeKeyCount).toBe(2);

    await other;
    expect(queue.activeKeyCount).toBe(1);

    gate.resolve();
    await Promise.allSettled([first, second]);
    expect(queue.activeKeyCount).toBe(0);

    await expect(queue.run('chat-a', async () => 'reused')).resolves.toBe('reused');
    expect(queue.activeKeyCount).toBe(0);
  });

  it('keeps a key while operations are still queued on it, so work submitted later waits for them', async () => {
    const queue = createKeyedSerialQueue<string>();
    const log: string[] = [];
    const secondGate = createDeferred();

    const first = queue.run('chat-a', async () => {
      log.push('first');
    });
    const second = queue.run('chat-a', async () => {
      await secondGate.promise;
      log.push('end second');
    });
    await first;

    const third = queue.run('chat-a', async () => {
      log.push('start third');
    });
    secondGate.resolve();

    await Promise.all([second, third]);
    expect(log).toEqual(['first', 'end second', 'start third']);
  });
});
