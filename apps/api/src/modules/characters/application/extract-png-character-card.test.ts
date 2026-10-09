import { describe, expect, it } from 'vitest';

import { extractPngCharacterCard } from './extract-png-character-card.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const UNCOMPRESSED = 0;
const DEFLATE_METHOD = 0;

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const unverifiedCrc = Buffer.alloc(4);

  return Buffer.concat([length, Buffer.from(type, 'ascii'), data, unverifiedCrc]);
}

function internationalTextChunk(keyword: string, languageTag: string, translatedKeyword: string, text: string) {
  return pngChunk(
    'iTXt',
    Buffer.concat([
      Buffer.from(keyword, 'latin1'),
      Buffer.from([0, UNCOMPRESSED, DEFLATE_METHOD]),
      Buffer.from(languageTag, 'ascii'),
      Buffer.from([0]),
      Buffer.from(translatedKeyword, 'utf8'),
      Buffer.from([0]),
      Buffer.from(text, 'utf8'),
    ]),
  );
}

function pngWith(...chunks: Buffer[]): Buffer {
  return Buffer.concat([PNG_SIGNATURE, ...chunks, pngChunk('IEND', Buffer.alloc(0))]);
}

const CARD_BASE64 = Buffer.from(
  JSON.stringify({ data: { first_mes: 'Привет.', name: 'Ирис' }, spec: 'chara_card_v2', spec_version: '2.0' }),
  'utf8',
).toString('base64');

describe('extractPngCharacterCard', () => {
  it.each([
    { languageTag: 'ru', translatedKeyword: 'Персонаж' },
    { languageTag: '', translatedKeyword: '' },
  ])('reads a card from an uncompressed iTXt chunk past language tag $languageTag:$translatedKeyword', ({
    languageTag,
    translatedKeyword,
  }) => {
    const png = pngWith(internationalTextChunk('chara', languageTag, translatedKeyword, CARD_BASE64));

    const card = extractPngCharacterCard(png);

    expect(card.name).toBe('Ирис');
    expect(card.firstMessage).toBe('Привет.');
  });
});
