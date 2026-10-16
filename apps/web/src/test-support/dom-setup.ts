import { cleanup } from '@testing-library/react';
import { afterAll, afterEach } from 'vitest';

import { domFetchGuard } from './dom-fetch-guard';

afterEach(() => {
  cleanup();
  domFetchGuard.assertNoneRefused();
});
afterAll(() => {
  domFetchGuard.assertNoneRefused();
});
