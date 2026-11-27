import { describe, expect, it } from 'vitest';

import { isPlainFileName, PLAIN_FILE_NAME_MAX_LENGTH } from './plain-file-name.js';

const EMOJI = '\u{1F409}';

describe('isPlainFileName', () => {
  it.each([
    'Mr..json',
    'v1..2 final.json',
    'Анонимный чат.json',
    `${EMOJI} дракон.json`,
    'CON.json',
    'con',
    'name with spaces.json',
    'a',
    '_',
  ])('accepts %j: inner double dots, non-ASCII text and device names are plain file names', (value) => {
    expect(isPlainFileName(value)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['a lone dot', '.'],
    ['a lone double dot', '..'],
    ['a leading dot', '.hidden.json'],
    ['a parent traversal', '../user-settings.json'],
    ['a slash', 'a/b.json'],
    ['a backslash', 'a\\b.json'],
    ['an alternate data stream', 'notes.json:hidden'],
    ['a drive prefix', 'C:evil.json'],
    ['a tab', 'a\tb.json'],
    ['a line feed', 'a\nb.json'],
    ['a NUL', `null${String.fromCharCode(0)}byte.json`],
    ['a DEL', `a${String.fromCharCode(0x7f)}b.json`],
    ['a trailing dot', 'evil.json.'],
    ['a trailing space', 'evil.json '],
    ['a lone high surrogate', '\uD83D.png'],
    ['a lone low surrogate', 'a\uDC09.png'],
  ])('rejects %s', (_case, value) => {
    expect(isPlainFileName(value)).toBe(false);
  });

  it('counts the length limit in UTF-16 units, so a name of astral characters reaches it at half as many', () => {
    const atLimit = `${'a'.repeat(PLAIN_FILE_NAME_MAX_LENGTH - 5)}.json`;
    const astralAtLimit = `${EMOJI.repeat((PLAIN_FILE_NAME_MAX_LENGTH - 6) / 2)}a.json`;

    expect(PLAIN_FILE_NAME_MAX_LENGTH).toBe(200);
    expect(isPlainFileName(atLimit)).toBe(true);
    expect(isPlainFileName(`a${atLimit}`)).toBe(false);
    expect(astralAtLimit).toHaveLength(PLAIN_FILE_NAME_MAX_LENGTH);
    expect(isPlainFileName(astralAtLimit)).toBe(true);
    expect(isPlainFileName(`${EMOJI}${astralAtLimit.slice(1)}`)).toBe(false);
  });
});
