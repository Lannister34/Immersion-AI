import type { MessageFormatting } from '@immersion/contracts/settings';
import type { ReactNode } from 'react';

type SegmentRenderer = (inner: string, key: string) => ReactNode;

export const DEFAULT_MESSAGE_FORMATTING: MessageFormatting = {
  actionsItalic: true,
  quotesHighlighted: false,
};

const CODE_PATTERN = /`([^`\n]+)`/g;
const BOLD_PATTERN = /\*\*([\s\S]+?)\*\*/g;
const ACTION_PATTERN = /\*([^*]+?)\*/g;
// Речь в прямых и типографских кавычках; перенос строки прерывает реплику.
const QUOTE_PATTERN = /[«"]([^«»"\n]+)[»"]/g;

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
 * Разметка в стиле SillyTavern: `код`, **жирный**, *действия*, речь в кавычках.
 * Незакрытые звёздочки остаются обычным текстом, HTML не интерпретируется —
 * узлы строятся React-ом, а не через innerHTML.
 */
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

// Обрезанное превью часто теряет закрывающую звёздочку: убираем висячие символы
// разметки, прилипшие к слову, но не трогаем одиночные (например, «5 * 3»).
const DANGLING_MARKUP_PATTERN = /(?<=\S)[*`]|[*`](?=\S)/gu;

/** Одна строка без разметки — для превью в списках. */
export function stripMessageMarkup(text: string): string {
  return text
    .replace(CODE_PATTERN, '$1')
    .replace(BOLD_PATTERN, '$1')
    .replace(ACTION_PATTERN, '$1')
    .replace(DANGLING_MARKUP_PATTERN, '')
    .replace(/\s+/gu, ' ')
    .trim();
}
