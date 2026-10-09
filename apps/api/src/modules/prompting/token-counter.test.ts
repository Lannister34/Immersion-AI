import { describe, expect, it } from 'vitest';

import { countTokensHeuristic } from './application/token-counter.js';

describe('countTokensHeuristic', () => {
  it('keeps the historic estimate of one token per four characters, rounded up and never below one', () => {
    expect(countTokensHeuristic(['', 'abcd', 'abcde', 'Привет мир'])).toEqual({
      counts: [1, 1, 2, 3],
      method: 'approximate',
    });
  });
});
