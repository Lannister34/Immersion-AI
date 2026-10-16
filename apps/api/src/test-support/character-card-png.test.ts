import { describe, expect, it } from 'vitest';

import { buildCharacterCardPng, type CharacterCardPngOptions } from './character-card-png.js';

const CARD = {
  spec: 'chara_card_v2',
  data: { name: 'Эмбер 🐉', first_mes: 'Привет, ты тоже пришёл за светлячками?', tags: ['ru'] },
};

const CARD_BASE64 = Buffer.from(JSON.stringify(CARD), 'utf8').toString('base64');

const ENCODINGS: readonly Required<CharacterCardPngOptions>[] = [
  { keyword: 'chara', chunkType: 'tEXt' },
  { keyword: 'chara', chunkType: 'iTXt' },
  { keyword: 'ccv3', chunkType: 'tEXt' },
  { keyword: 'ccv3', chunkType: 'iTXt' },
];

describe('buildCharacterCardPng', () => {
  it.each(ENCODINGS)('stores the base64 card JSON under $keyword in a $chunkType chunk', (options) => {
    const png = buildCharacterCardPng(CARD, options);

    expect(png.includes(Buffer.from(`${options.chunkType}${options.keyword}\u0000`, 'latin1'))).toBe(true);
    expect(png.includes(Buffer.from(CARD_BASE64, 'latin1'))).toBe(true);
  });

  it('stores the card under chara in a tEXt chunk by default', () => {
    const png = buildCharacterCardPng(CARD);

    expect(png.includes(Buffer.from('tEXtchara\u0000', 'latin1'))).toBe(true);
    expect(png.includes(Buffer.from('iTXt', 'ascii'))).toBe(false);
    expect(png.includes(Buffer.from('ccv3', 'ascii'))).toBe(false);
  });
});
