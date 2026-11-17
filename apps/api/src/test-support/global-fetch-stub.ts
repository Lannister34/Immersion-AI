import { vi } from 'vitest';

import { createHttpStub, type HttpStub } from './http-stub.js';

export function stubGlobalFetch(): HttpStub {
  const http = createHttpStub();
  vi.stubGlobal('fetch', http.fetch);

  return http;
}
