import { beforeEach, onTestFinished } from 'vitest';

import { claimTemporaryProject } from './claim-temporary-project.js';
import type { ProjectFixture } from './temporary-project.js';

export function useTemporaryDataRoot(fixture: ProjectFixture = 'empty'): () => string {
  let current: string | null = null;

  beforeEach(async () => {
    current = (await claimTemporaryProject(fixture)).dataRoot;
    onTestFinished(() => {
      current = null;
    });
  });

  return () => {
    if (current === null) {
      throw new Error('useTemporaryDataRoot() gives a data root only inside a test, after its beforeEach has run.');
    }

    return current;
  };
}
