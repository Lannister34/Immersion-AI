import { describe, expect, it } from 'vitest';

import { isSameOriginRequest } from './same-origin-request.js';

describe('isSameOriginRequest', () => {
  it('accepts a form posted by the login page itself', () => {
    expect(isSameOriginRequest({ host: '192.168.31.216:4788', origin: 'http://192.168.31.216:4788' })).toBe(true);
    expect(
      isSameOriginRequest({ host: '127.0.0.1:4788', origin: 'http://127.0.0.1:4788', 'sec-fetch-site': 'same-origin' }),
    ).toBe(true);
  });

  it('accepts a client that sends neither header, which no browser page can be', () => {
    expect(isSameOriginRequest({ host: '127.0.0.1:4788' })).toBe(true);
  });

  it('refuses a post from any other page, the opaque origin included', () => {
    expect(isSameOriginRequest({ host: '127.0.0.1:4788', origin: 'https://evil.example' })).toBe(false);
    expect(isSameOriginRequest({ host: '127.0.0.1:4788', origin: 'http://127.0.0.1:5173' })).toBe(false);
    expect(isSameOriginRequest({ host: '127.0.0.1:4788', origin: 'null' })).toBe(false);
    expect(isSameOriginRequest({ host: '127.0.0.1:4788', 'sec-fetch-site': 'cross-site' })).toBe(false);
    expect(isSameOriginRequest({ host: '127.0.0.1:4788', 'sec-fetch-site': 'same-site' })).toBe(false);
  });
});
