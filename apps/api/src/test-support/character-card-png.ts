import { buildPng, type PngTextChunkType } from './png-image.js';

export type CharacterCardKeyword = 'chara' | 'ccv3';

export interface CharacterCardPngOptions {
  readonly keyword?: CharacterCardKeyword;
  readonly chunkType?: PngTextChunkType;
}

export function buildCharacterCardPng(
  card: Readonly<Record<string, unknown>>,
  { keyword = 'chara', chunkType = 'tEXt' }: CharacterCardPngOptions = {},
): Buffer {
  const text = Buffer.from(JSON.stringify(card), 'utf8').toString('base64');

  return buildPng({ textChunks: [{ chunkType, keyword, text }] });
}
