import { describe, expect, it } from 'vitest';

import { toSafeReturnPath } from './return-path.js';

describe('toSafeReturnPath', () => {
  it('keeps a path and query on this server, without the fragment', () => {
    expect(toSafeReturnPath('/chat/abc?tab=2#top')).toBe('/chat/abc?tab=2');
  });

  it('falls back to the root for a missing or relative value', () => {
    for (const value of [null, undefined, '', 'chat', 'https://evil.example/']) {
      expect(`${value} ${toSafeReturnPath(value)}`).toBe(`${value} /`);
    }
  });

  it('refuses every spelling that a browser would read as another host', () => {
    for (const value of [
      '//evil.example/',
      '/\\evil.example',
      '/\t/evil.example/',
      '/\n/evil.example',
      '/\\\\evil.example',
    ]) {
      expect(`${JSON.stringify(value)} ${toSafeReturnPath(value)}`).toBe(`${JSON.stringify(value)} /`);
    }
  });

  it('percent-encodes non-ASCII so the Location header stays valid', () => {
    expect(toSafeReturnPath('/чат')).toBe('/%D1%87%D0%B0%D1%82');
  });

  it('never returns into the login gate itself', () => {
    expect(toSafeReturnPath('/__web/logout')).toBe('/');
    expect(toSafeReturnPath('/__web/login?next=/chat')).toBe('/');
  });
});
