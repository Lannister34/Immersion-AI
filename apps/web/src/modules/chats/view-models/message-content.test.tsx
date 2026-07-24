import type { MessageFormatting } from '@immersion/contracts/settings';
import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';

import { renderMessageContent, stripMessageMarkup } from './message-content';

function describeNodes(text: string, formatting?: MessageFormatting): string[] {
  return renderMessageContent(text, formatting).map((node) => {
    if (typeof node === 'string') {
      return `text:${node}`;
    }
    if (isValidElement<{ children?: unknown }>(node)) {
      return `${String(node.type)}:${String(node.props.children)}`;
    }
    return 'unknown';
  });
}

describe('renderMessageContent', () => {
  it('renders actions in asterisks as emphasis and keeps the surrounding text', () => {
    expect(describeNodes('*Мария улыбается* Привет!')).toEqual(['em:Мария улыбается', 'text: Привет!']);
  });

  it('renders bold before italics so double asterisks are not split', () => {
    expect(describeNodes('**важно** и *действие*')).toEqual(['strong:важно', 'text: и ', 'em:действие']);
  });

  it('keeps unbalanced asterisks as plain text', () => {
    expect(describeNodes('5 * 3 = 15')).toEqual(['text:5 * 3 = 15']);
  });

  it('does not format inside code spans', () => {
    expect(describeNodes('`a *b* c`')).toEqual(['code:a *b* c']);
  });

  it('spans several lines inside one action', () => {
    expect(describeNodes('*первая\nвторая*')).toEqual(['em:первая\nвторая']);
  });

  it('keeps actions plain when the italics option is off', () => {
    expect(describeNodes('*действие*', { actionsItalic: false, quotesHighlighted: false })).toEqual([
      'text:*действие*',
    ]);
  });

  it('highlights quoted speech when the option is on', () => {
    expect(describeNodes('Он сказал "привет" тихо', { actionsItalic: true, quotesHighlighted: true })).toEqual([
      'text:Он сказал ',
      'span:«,привет,»',
      'text: тихо',
    ]);
  });
});

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
});
