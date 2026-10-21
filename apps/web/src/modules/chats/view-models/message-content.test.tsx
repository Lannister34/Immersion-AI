import type { MessageFormatting } from '@immersion/contracts/settings';
import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';

import { renderMessageContent } from './message-content';

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

  it('highlights speech in guillemets as well as in straight quotes', () => {
    expect(
      describeNodes('Она шепнула «уходи» и отвернулась', { actionsItalic: true, quotesHighlighted: true }),
    ).toEqual(['text:Она шепнула ', 'span:«,уходи,»', 'text: и отвернулась']);
  });

  it('does not highlight a quote that a line break interrupts', () => {
    expect(describeNodes('Он сказал "привет\nи ушёл"', { actionsItalic: true, quotesHighlighted: true })).toEqual([
      'text:Он сказал "привет\nи ушёл"',
    ]);
  });

  it('keeps HTML as literal text instead of interpreting it', () => {
    expect(describeNodes('<b>жирный</b> <img src=x onerror=alert(1)>')).toEqual([
      'text:<b>жирный</b> <img src=x onerror=alert(1)>',
    ]);
  });
});
