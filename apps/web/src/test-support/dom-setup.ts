import { cleanup } from '@testing-library/react';
import { afterAll, afterEach } from 'vitest';

import { domFetchGuard } from './dom-fetch-guard';
import { mediaQueryStub } from './media-query-stub';

window.scrollTo = () => undefined;
mediaQueryStub.install(window);

afterEach(() => {
  cleanup();
  mediaQueryStub.matchOnly([]);
  domFetchGuard.assertNoneRefused();
});
afterAll(() => {
  domFetchGuard.assertNoneRefused();
});
