import { CharacterIdSchema } from '@immersion/contracts/characters';
import { describe, expect, it } from 'vitest';

import { FILE_BASE_NAME_MAX_CODE_POINTS, FILE_BASE_NAME_MAX_UTF8_BYTES, fileBaseNameFrom } from './file-base-name.js';

const EMOJI = '\u{1F409}';
const LONE_HIGH_SURROGATE = '\uD83D';
const FALLBACK = 'scenario';

describe('fileBaseNameFrom', () => {
  it.each([
    ['a trailing dot', 'Mr.', 'Mr'],
    ['a trailing ellipsis of dots', 'Тайна...', 'Тайна'],
    ['inner dot runs', 'v1...2', 'v1.2'],
    ['leading dots', '..hidden', 'hidden'],
    ['only dots', '...', FALLBACK],
    ['only spaces', '   ', FALLBACK],
    ['an empty text', '', FALLBACK],
    ['whitespace runs', ' Мария 　 Чернова ', 'Мария_Чернова'],
    ['a tab, which is a control character', 'a\tb', 'a_b'],
    ['Windows-forbidden characters', 'a:b*c?d"e<f>g|h/i\\j', 'a_b_c_d_e_f_g_h_i_j'],
    ['control characters', `a${String.fromCharCode(0)}b${String.fromCharCode(0x7f)}c`, 'a_b_c'],
    ['a lone high surrogate', LONE_HIGH_SURROGATE, '_'],
    ['a device name', 'CON', '_CON'],
    ['a device name in another case with an extension', 'con.v2', '_con.v2'],
    ['a numbered device name', 'lpt9', '_lpt9'],
    ['a device name with a superscript digit', 'COM¹', '_COM¹'],
    ['a console device name', 'CONOUT$', '_CONOUT$'],
    ['a name that only starts like a device', 'CONSOLE', 'CONSOLE'],
    ['a name with spaces around a device name', ' NUL ', '_NUL'],
  ])('derives a plain base name from %s', (_case, text, expected) => {
    expect(fileBaseNameFrom(text, FALLBACK)).toBe(expected);
  });

  it('cuts at 80 code points before stripping the dots the cut leaves at the end', () => {
    expect(FILE_BASE_NAME_MAX_CODE_POINTS).toBe(80);
    expect(fileBaseNameFrom(`${'a'.repeat(79)}.x`, FALLBACK)).toBe('a'.repeat(79));
    expect(fileBaseNameFrom('a'.repeat(81), FALLBACK)).toBe('a'.repeat(80));
  });

  it('drops an emoji spanning the 80th code point whole instead of splitting its surrogate pair', () => {
    const text = `${'a'.repeat(79)}${EMOJI}${EMOJI}`;

    expect(fileBaseNameFrom(text, FALLBACK)).toBe(`${'a'.repeat(79)}${EMOJI}`);
    expect(fileBaseNameFrom(`${'a'.repeat(80)}${EMOJI}`, FALLBACK)).toBe('a'.repeat(80));
  });

  it('keeps a name of four-byte characters within 200 UTF-8 bytes, so POSIX file systems can hold it', () => {
    const derived = fileBaseNameFrom(EMOJI.repeat(80), FALLBACK);

    expect(FILE_BASE_NAME_MAX_UTF8_BYTES).toBe(200);
    expect(derived).toBe(EMOJI.repeat(50));
    expect(Buffer.byteLength(`_${derived}-xxxxxxxx.jsonl`, 'utf8')).toBeLessThanOrEqual(255);
  });

  it('every derived name satisfies the library id schema, with and without a suffix and as a chat export', () => {
    const fragments = [
      '',
      ' ',
      '.',
      '...',
      'Mr.',
      'CON',
      'con.v2',
      'Тайна',
      EMOJI,
      LONE_HIGH_SURROGATE,
      'a:b*c',
      '\t',
      'x'.repeat(79),
      EMOJI.repeat(80),
      'Ж'.repeat(120),
    ];
    const texts = fragments.flatMap((first) => fragments.flatMap((second) => [first + second, `${first}.${second}`]));

    for (const text of texts) {
      const derived = fileBaseNameFrom(text, FALLBACK);
      for (const fileName of [`${derived}.json`, `${derived}-0123abcd.json`, `${derived}.jsonl`]) {
        expect(CharacterIdSchema.safeParse(fileName).success, JSON.stringify(fileName)).toBe(true);
        expect(Buffer.byteLength(fileName, 'utf8')).toBeLessThanOrEqual(255);
      }
    }
  });
});
