import { afterAll, afterEach, beforeEach } from 'vitest';

import { installForeignConnectionGuard } from './foreign-connection-guard.js';
import { createSandboxDataRoot } from './sandbox-data-root.js';

const foreignConnectionGuard = installForeignConnectionGuard();
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
