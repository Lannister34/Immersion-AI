import type { MessageFormatting } from '@immersion/contracts/settings';
import type { ReactNode } from 'react';

import { ACTION_PATTERN, BOLD_PATTERN, CODE_PATTERN, QUOTE_PATTERN } from './message-markup-patterns';

type SegmentRenderer = (inner: string, key: string) => ReactNode;

export const DEFAULT_MESSAGE_FORMATTING: MessageFormatting = {
  actionsItalic: true,
  quotesHighlighted: false,
};

function splitSegments(nodes: ReactNode[], pattern: RegExp, render: SegmentRenderer): ReactNode[] {
  const result: ReactNode[] = [];

  nodes.forEach((node, nodeIndex) => {
    if (typeof node !== 'string') {
      result.push(node);
      return;
    }

    const matcher = new RegExp(pattern.source, pattern.flags);
    let lastIndex = 0;

    for (let match = matcher.exec(node); match !== null; match = matcher.exec(node)) {
      if (match.index > lastIndex) {
        result.push(node.slice(lastIndex, match.index));
      }

      result.push(render(match[1] ?? '', `${nodeIndex}-${match.index}`));
      lastIndex = matcher.lastIndex;
    }

    if (lastIndex < node.length) {
      result.push(node.slice(lastIndex));
    }
  });

  return result;
}

export function renderMessageContent(
  text: string,
  formatting: MessageFormatting = DEFAULT_MESSAGE_FORMATTING,
): ReactNode[] {
  let nodes: ReactNode[] = [text];

  nodes = splitSegments(nodes, CODE_PATTERN, (inner, key) => (
    <code className="bubble__code" key={`code-${key}`}>
      {inner}
    </code>
  ));
  nodes = splitSegments(nodes, BOLD_PATTERN, (inner, key) => <strong key={`bold-${key}`}>{inner}</strong>);

  if (formatting.actionsItalic) {
    nodes = splitSegments(nodes, ACTION_PATTERN, (inner, key) => (
      <em className="bubble__action" key={`action-${key}`}>
        {inner}
      </em>
    ));
  }

  if (formatting.quotesHighlighted) {
    nodes = splitSegments(nodes, QUOTE_PATTERN, (inner, key) => (
      <span className="bubble__speech" key={`speech-${key}`}>
        «{inner}»
      </span>
    ));
  }

  return nodes;
}
