import { describe, expect, it } from 'vitest';

import { resolveWebRedirectUrl } from './web-redirect-url.js';

describe('resolveWebRedirectUrl', () => {
  it('keeps the host the browser used and swaps in the web port and the chat path', () => {
    expect(resolveWebRedirectUrl('192.168.31.216:4787', 4788)).toBe('http://192.168.31.216:4788/chat');
    expect(resolveWebRedirectUrl('[::1]:4787', 5173)).toBe('http://[::1]:5173/chat');
  });

  it('keeps a host outside ASCII in its punycode form', () => {
    expect(resolveWebRedirectUrl('иммерсия.локально:4787', 4788)).toBe(
      'http://xn--e1afboazh7i.xn--80atcckce4i:4788/chat',
    );
  });

  it('falls back to loopback when the request has no host or one that is not a host', () => {
    expect(resolveWebRedirectUrl(undefined, 4788)).toBe('http://127.0.0.1:4788/chat');
    expect(resolveWebRedirectUrl('', 4788)).toBe('http://127.0.0.1:4788/chat');
    expect(resolveWebRedirectUrl('exa mple:4787', 4788)).toBe('http://127.0.0.1:4788/chat');
  });
});
