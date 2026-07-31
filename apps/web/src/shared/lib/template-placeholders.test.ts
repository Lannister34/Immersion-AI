import { describe, expect, it } from 'vitest';

import { insertTemplatePlaceholder, splitTemplateText } from './template-placeholders';

describe('splitTemplateText', () => {
  it('marks placeholders and keeps the surrounding text', () => {
    expect(splitTemplateText('Привет, {{user}}! Я {{char}}.')).toEqual([
      { isPlaceholder: false, value: 'Привет, ' },
      { isPlaceholder: true, value: '{{user}}' },
      { isPlaceholder: false, value: '! Я ' },
      { isPlaceholder: true, value: '{{char}}' },
      { isPlaceholder: false, value: '.' },
    ]);
  });

  it('accepts spacing inside the braces', () => {
    expect(splitTemplateText('{{ user }}')).toEqual([{ isPlaceholder: true, value: '{{ user }}' }]);
  });

  it('leaves unknown placeholders untouched', () => {
    expect(splitTemplateText('{{system}}')).toEqual([{ isPlaceholder: false, value: '{{system}}' }]);
  });
});

describe('insertTemplatePlaceholder', () => {
  it('inserts at the caret and reports the next caret position', () => {
    expect(insertTemplatePlaceholder('Привет, !', 8, 8, '{{user}}')).toEqual({
      caret: 16,
      value: 'Привет, {{user}}!',
    });
  });

  it('replaces the current selection', () => {
    expect(insertTemplatePlaceholder('Привет, Миша!', 8, 12, '{{user}}')).toEqual({
      caret: 16,
      value: 'Привет, {{user}}!',
    });
  });

  it('clamps positions outside the value', () => {
    expect(insertTemplatePlaceholder('Ок', 99, 99, '{{char}}')).toEqual({
      caret: 10,
      value: 'Ок{{char}}',
    });
  });
});
