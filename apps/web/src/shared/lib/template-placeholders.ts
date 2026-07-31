export const TEMPLATE_PLACEHOLDERS = ['{{user}}', '{{char}}'] as const;

export type TemplatePlaceholder = (typeof TEMPLATE_PLACEHOLDERS)[number];

// Допускаем пробелы внутри скобок: карточки из SillyTavern встречаются в обоих видах.
const PLACEHOLDER_PATTERN = /(\{\{\s*(?:user|char)\s*\}\})/giu;

export interface TemplateTextSegment {
  isPlaceholder: boolean;
  value: string;
}

/** Разбивает текст на обычные куски и плейсхолдеры — для подсветки. */
export function splitTemplateText(text: string): TemplateTextSegment[] {
  return text
    .split(PLACEHOLDER_PATTERN)
    .filter((part) => part.length > 0)
    .map((part) => ({
      isPlaceholder: new RegExp(`^${PLACEHOLDER_PATTERN.source}$`, 'iu').test(part),
      value: part,
    }));
}

export interface TemplateInsertResult {
  caret: number;
  value: string;
}

/** Вставляет плейсхолдер вместо выделения и возвращает позицию курсора после него. */
export function insertTemplatePlaceholder(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  placeholder: string,
): TemplateInsertResult {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));

  return {
    caret: start + placeholder.length,
    value: `${value.slice(0, start)}${placeholder}${value.slice(end)}`,
  };
}
