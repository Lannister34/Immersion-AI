import { afterAll, afterEach, beforeEach } from 'vitest';

import { installForeignConnectionGuard } from './foreign-connection-guard.js';
import { createSandboxDataRoot } from './sandbox-data-root.js';

const foreignConnectionGuard = installForeignConnectionGuard();
// TODO: delete the worker data root once no repository reads IMMERSION_DATA_ROOT (F-43)
const sandboxDataRoot = createSandboxDataRoot();
sandboxDataRoot.claim();

beforeEach(() => sandboxDataRoot.fillIfUnset());
afterEach(() => {
  sandboxDataRoot.fillIfUnset();
  foreignConnectionGuard.assertNoneRefused();
});
afterAll(() => {
  try {
    foreignConnectionGuard.assertNoneRefused();
  } finally {
    sandboxDataRoot.remove();
  }
});
