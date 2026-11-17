import { describe, expect, it } from 'vitest';

import {
  readWebSessionToken,
  serializeClearedWebSessionCookie,
  serializeWebSessionCookie,
  withoutWebSessionCookie,
} from './web-session-cookie.js';

describe('the web session cookie', () => {
  it('reads the token among other cookies', () => {
    expect(readWebSessionToken('theme=dark; immersion_web_session=abc-123; lang=ru')).toBe('abc-123');
  });

  it('reads no token from a missing header, a missing cookie or an empty value', () => {
    expect(readWebSessionToken(undefined)).toBeNull();
    expect(readWebSessionToken('theme=dark')).toBeNull();
    expect(readWebSessionToken('immersion_web_session=')).toBeNull();
    expect(readWebSessionToken('ximmersion_web_session=abc')).toBeNull();
  });

  it('removes only the session cookie before a request goes on', () => {
    expect(withoutWebSessionCookie('theme=dark; immersion_web_session=abc; lang=ru')).toBe('theme=dark; lang=ru');
    expect(withoutWebSessionCookie('immersion_web_session=abc')).toBeUndefined();
  });

  it('is an HttpOnly, SameSite=Strict browser-session cookie with no lifetime of its own', () => {
    expect(serializeWebSessionCookie('abc')).toBe('immersion_web_session=abc; Path=/; HttpOnly; SameSite=Strict');
    expect(serializeClearedWebSessionCookie()).toBe(
      'immersion_web_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
    );
  });
});
