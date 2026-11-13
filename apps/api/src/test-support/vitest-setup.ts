import { afterAll, afterEach } from 'vitest';

import { installForeignConnectionGuard } from './foreign-connection-guard.js';

const foreignConnectionGuard = installForeignConnectionGuard();

afterEach(() => foreignConnectionGuard.assertNoneRefused());
afterAll(() => foreignConnectionGuard.assertNoneRefused());
