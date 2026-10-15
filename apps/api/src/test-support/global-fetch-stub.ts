import { vi } from 'vitest';

import { createHttpStub, type HttpStub } from './http-stub.js';

// TODO: delete once every outbound call goes through the HttpFetch port (F-41)
export function stubGlobalFetch(): HttpStub {
  const http = createHttpStub();
  vi.stubGlobal('fetch', http.fetch);

  return http;
}
