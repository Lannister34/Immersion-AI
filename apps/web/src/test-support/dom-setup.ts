import { cleanup } from '@testing-library/react';
import { afterAll, afterEach } from 'vitest';

import { domFetchGuard } from './dom-fetch-guard';

window.scrollTo = () => undefined;

afterEach(() => {
  cleanup();
  domFetchGuard.assertNoneRefused();
});
afterAll(() => {
  domFetchGuard.assertNoneRefused();
});
