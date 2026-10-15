import { onTestFinished } from 'vitest';

import { createDeferred } from './deferred.js';

export function captureNextUnhandledRejection(): Promise<unknown> {
  const runnerListeners = process.listeners('unhandledRejection');
  const captured = createDeferred<unknown>();

  process.removeAllListeners('unhandledRejection');
  process.once('unhandledRejection', (reason) => captured.resolve(reason));
  onTestFinished(() => {
    process.removeAllListeners('unhandledRejection');
    for (const listener of runnerListeners) {
      process.on('unhandledRejection', listener);
    }
  });

  return captured.promise;
}
