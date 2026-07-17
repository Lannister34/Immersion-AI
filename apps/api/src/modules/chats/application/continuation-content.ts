const SENTENCE_END_PATTERN = /[.!?…:]["'»”’)\]]*$/u;
const BLOCK_START_PATTERN = /^[—–«"*#>-]/u;

/**
 * Joins a generated continuation onto existing message content.
 *
 * The separator is a single space by default (the reply was cut mid-sentence).
 * A newline is used only when the existing text already closes a sentence and
 * the continuation opens a new block (dialogue dash, quote, list marker).
 */
export function joinContinuationContent(existingContent: string, continuation: string): string {
  const base = existingContent.replace(/\s+$/u, '');
  const addition = continuation.replace(/^\s+/u, '');

  if (base.length === 0) {
    return addition;
  }

  if (addition.length === 0) {
    return base;
  }

  const separator = SENTENCE_END_PATTERN.test(base) && BLOCK_START_PATTERN.test(addition) ? '\n' : ' ';

  return `${base}${separator}${addition}`;
}
