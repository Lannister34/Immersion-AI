import { beforeEach, onTestFinished } from 'vitest';

import { createTestApi, type TestApi, type TestApiOptions } from './test-api.js';

export function useTestApi(options?: TestApiOptions): () => TestApi {
  let current: TestApi | null = null;

  beforeEach(async () => {
    current = await createTestApi(options);
    onTestFinished(() => {
      current = null;
    });
  });

  return () => {
    if (current === null) {
      throw new Error('useTestApi() gives an api only inside a test, after its beforeEach has run.');
    }

    return current;
  };
}
