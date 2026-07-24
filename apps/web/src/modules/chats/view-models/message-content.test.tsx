import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';

import { renderMessageContent } from './message-content';

function describeNodes(text: string): string[] {
  return renderMessageContent(text).map((node) => {
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
});
