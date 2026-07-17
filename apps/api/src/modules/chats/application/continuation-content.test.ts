import { describe, expect, it } from 'vitest';

import { joinContinuationContent } from './continuation-content.js';

describe('joinContinuationContent', () => {
  it('joins a mid-sentence cut with a single space', () => {
    expect(joinContinuationContent('Она посмотрела на', 'него и улыбнулась.')).toBe(
      'Она посмотрела на него и улыбнулась.',
    );
  });

  it('joins a finished sentence and a plain continuation with a single space', () => {
    expect(joinContinuationContent('Печь остыла.', 'Утром они вернулись.')).toBe('Печь остыла. Утром они вернулись.');
  });

  it('uses a newline when a finished sentence is followed by a dialogue dash', () => {
    expect(joinContinuationContent('Печь остыла.', '— Пора идти, — сказала она.')).toBe(
      'Печь остыла.\n— Пора идти, — сказала она.',
    );
  });

  it('treats a closing quote after terminal punctuation as a finished sentence', () => {
    expect(joinContinuationContent('«Хватит!»', '«Нет», — ответил он.')).toBe('«Хватит!»\n«Нет», — ответил он.');
  });

  it('trims boundary whitespace before joining', () => {
    expect(joinContinuationContent('Она посмотрела на  \n', '  него.')).toBe('Она посмотрела на него.');
  });

  it('returns the other part unchanged when one side is empty', () => {
    expect(joinContinuationContent('', 'Продолжение.')).toBe('Продолжение.');
    expect(joinContinuationContent('Начало.', '   ')).toBe('Начало.');
  });
});
