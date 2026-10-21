import { ACTION_PATTERN, BOLD_PATTERN, CODE_PATTERN } from './message-markup-patterns';

const DANGLING_MARKUP_PATTERN = /(?<=\S)[*`]|[*`](?=\S)/gu;

export function stripMessageMarkup(text: string): string {
  return text
    .replace(CODE_PATTERN, '$1')
    .replace(BOLD_PATTERN, '$1')
    .replace(ACTION_PATTERN, '$1')
    .replace(DANGLING_MARKUP_PATTERN, '')
    .replace(/\s+/gu, ' ')
    .trim();
}
