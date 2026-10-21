import { describe, expect, it } from 'vitest';

import { stripMessageMarkup } from './strip-message-markup';

describe('stripMessageMarkup', () => {
  it('removes markup characters for previews', () => {
    expect(stripMessageMarkup('*Мария улыбается* Привет! **важно** `код`')).toBe('Мария улыбается Привет! важно код');
  });

  it('drops a dangling asterisk left by truncation', () => {
    expect(stripMessageMarkup('*Мария сидит в парке и листает')).toBe('Мария сидит в парке и листает');
  });

  it('keeps a standalone asterisk that is not markup', () => {
    expect(stripMessageMarkup('5 * 3 = 15')).toBe('5 * 3 = 15');
  });

  it('folds line breaks into a single preview line', () => {
    expect(stripMessageMarkup('Первая строка\n\n  вторая\tстрока ')).toBe('Первая строка вторая строка');
  });
});
