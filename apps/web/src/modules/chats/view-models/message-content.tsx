import type { ReactNode } from 'react';

type SegmentRenderer = (inner: string, key: string) => ReactNode;

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

/**
 * Разметка в стиле SillyTavern: `код`, **жирный**, *действия курсивом*.
 * Незакрытые звёздочки остаются обычным текстом, HTML не интерпретируется —
 * узлы строятся React-ом, а не через innerHTML.
 */
export function renderMessageContent(text: string): ReactNode[] {
  let nodes: ReactNode[] = [text];

  nodes = splitSegments(nodes, /`([^`\n]+)`/g, (inner, key) => (
    <code className="bubble__code" key={`code-${key}`}>
      {inner}
    </code>
  ));
  nodes = splitSegments(nodes, /\*\*([\s\S]+?)\*\*/g, (inner, key) => <strong key={`bold-${key}`}>{inner}</strong>);
  nodes = splitSegments(nodes, /\*([^*]+?)\*/g, (inner, key) => (
    <em className="bubble__action" key={`action-${key}`}>
      {inner}
    </em>
  ));

  return nodes;
}
