import { describe, expect, it } from 'vitest';

import { createDeferred, type Deferred } from '../../test-support/deferred.js';
import { captureNextUnhandledRejection } from '../../test-support/unhandled-rejection-capture.js';
import { createSerialQueue } from './serial-queue.js';

describe('createSerialQueue', () => {
  it('runs operations in submission order, each after the previous one settles', async () => {
    const queue = createSerialQueue();
    const log: string[] = [];
    const gates = { first: createDeferred(), second: createDeferred(), third: createDeferred() };
    const firstStarted = createDeferred();

    function gatedOperation(name: keyof typeof gates, started?: Deferred<void>) {
      return async () => {
        log.push(`start ${name}`);
        started?.resolve();
        await gates[name].promise;
        log.push(`end ${name}`);

        return name;
      };
    }

    const results = Promise.all([
      queue.run(gatedOperation('first', firstStarted)),
      queue.run(gatedOperation('second')),
      queue.run(gatedOperation('third')),
    ]);

    await firstStarted.promise;
    expect(log).toEqual(['start first']);

    gates.third.resolve();
    gates.second.resolve();
    gates.first.resolve();

    await expect(results).resolves.toEqual(['first', 'second', 'third']);
    expect(log).toEqual(['start first', 'end first', 'start second', 'end second', 'start third', 'end third']);
  });

  it('a rejected operation does not block the next, and its own caller still receives the rejection', async () => {
    const queue = createSerialQueue();
    const gate = createDeferred();
    const failure = new Error('settings write failed');

    const failed = queue.run(async () => {
      await gate.promise;
      throw failure;
    });
    const next = queue.run(async () => 'next ran');
    gate.resolve();

    await expect(failed).rejects.toBe(failure);
    await expect(next).resolves.toBe('next ran');
  });

  it('an operation that throws before returning a promise rejects only its own run', async () => {
    const queue = createSerialQueue();
    const failure = new Error('thrown synchronously');
    const throwsSynchronously = (): Promise<string> => {
      throw failure;
    };

    const failed = queue.run(throwsSynchronously);
    const next = queue.run(async () => 'next ran');

    await expect(failed).rejects.toBe(failure);
    await expect(next).resolves.toBe('next ran');
  });

  it('a rejection whose caller dropped the promise still surfaces as an unhandled rejection', async () => {
    const unhandled = captureNextUnhandledRejection();
    const failure = new Error('dropped by its caller');

    void createSerialQueue().run(async () => {
      throw failure;
    });

    await expect(unhandled).resolves.toBe(failure);
  });
});
