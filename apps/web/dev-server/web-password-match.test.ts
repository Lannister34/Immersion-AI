import { describe, expect, it } from 'vitest';

import { matchesWebPassword } from './web-password-match.js';

describe('matchesWebPassword', () => {
  it('accepts the exact password, case and non-ASCII included', () => {
    expect(matchesWebPassword('Пароль-4821', 'Пароль-4821')).toBe(true);
  });

  it('refuses any other candidate, whatever its length', () => {
    for (const candidate of ['', '482', '48210', 'пароль-4821', 'Пароль-4821 ']) {
      expect(`${candidate} ${matchesWebPassword(candidate, 'Пароль-4821')}`).toBe(`${candidate} false`);
    }
  });
});
