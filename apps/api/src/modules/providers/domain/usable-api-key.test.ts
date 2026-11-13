import { describe, expect, it } from 'vitest';

import { readUsableApiKey } from './usable-api-key.js';

describe('readUsableApiKey', () => {
  it('returns a stored key without the whitespace around it', () => {
    expect(readUsableApiKey('  sk-proj-AbC_123.xyz  ')).toBe('sk-proj-AbC_123.xyz');
  });

  it('finds no key when nothing or only spaces are stored', () => {
    expect(readUsableApiKey(undefined)).toBeNull();
    expect(readUsableApiKey('   ')).toBeNull();
  });

  it('refuses a key that could not travel in an HTTP header', () => {
    expect(readUsableApiKey('sk-before\nafter')).toBeNull();
    expect(readUsableApiKey('sk-inner space')).toBeNull();
    expect(readUsableApiKey('sk-ключ')).toBeNull();
  });

  it('is needed because fetch quotes an invalid header value, key included, in its error message', () => {
    expect(() => new Headers({ Authorization: 'Bearer sk-canary\nxyz' })).toThrow(/sk-canary/u);
  });
});
