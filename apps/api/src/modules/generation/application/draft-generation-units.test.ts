import { describe, expect, it } from 'vitest';

import { replaceNamesWithPlaceholders } from './draft-generation-support.js';
import { extractJsonFromModelOutput } from './model-json-output.js';

describe('extractJsonFromModelOutput', () => {
  it('reads the outermost JSON object out of surrounding prose without a code fence', () => {
    const raw = 'Конечно! Вот карточка: {"name": "Ария", "tags": ["скульптор"]} Надеюсь, подойдёт.';

    expect(extractJsonFromModelOutput(raw)).toEqual({ name: 'Ария', tags: ['скульптор'] });
  });
});

describe('extractJsonFromModelOutput repair path', () => {
  it('escapes raw control characters inside string values', () => {
    const raw = '{"firstMessage": "Строка один\nСтрока\tдва\r", "name": "Ария"}';

    expect(extractJsonFromModelOutput(raw)).toEqual({
      firstMessage: 'Строка один\nСтрока\tдва\r',
      name: 'Ария',
    });
  });

  it('removes trailing commas without touching commas inside string values', () => {
    const raw = '{"firstMessage": "смеётся, } \\* конец", "name": "Ария",}';

    expect(extractJsonFromModelOutput(raw)).toEqual({
      firstMessage: 'смеётся, } * конец',
      name: 'Ария',
    });
  });

  it('keeps a bare value that directly precedes a closing bracket while repairing', () => {
    const raw = '{"note": "\\*", "counts": [1, 2], "done": true,}';

    expect(extractJsonFromModelOutput(raw)).toEqual({ counts: [1, 2], done: true, note: '*' });
  });

  it('removes trailing commas before closing brackets in arrays', () => {
    const raw = '{"tags": ["один", "два",], "name": "X", "note": "\\*",}';

    expect(extractJsonFromModelOutput(raw)).toEqual({
      name: 'X',
      note: '*',
      tags: ['один', 'два'],
    });
  });
});

describe('replaceNamesWithPlaceholders declension matching', () => {
  it('replaces declined name forms but not common words sharing the stem', () => {
    const text = 'Вера сказала верно, что ездить верхом весело. Веру видели у ворот, а с Верой шли домой.';

    expect(replaceNamesWithPlaceholders(text, null, 'Вера')).toBe(
      '{{user}} сказала верно, что ездить верхом весело. {{user}} видели у ворот, а с {{user}} шли домой.',
    );
  });

  it('keeps exact word-boundary matching for non-Cyrillic names', () => {
    expect(replaceNamesWithPlaceholders('Anna and Annabelle met Anna.', 'Anna', null)).toBe(
      '{{char}} and Annabelle met {{char}}.',
    );
  });
});
