import zlib from 'node:zlib';

export type PngTextChunkType = 'tEXt' | 'iTXt';

export interface PngTextChunk {
  readonly chunkType: PngTextChunkType;
  readonly keyword: string;
  readonly text: string;
}

export interface PngImageOptions {
  readonly width?: number;
  readonly height?: number;
  readonly textChunks?: readonly PngTextChunk[];
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IMAGE_HEADER_BYTES = 13;
const GRAYSCALE_BIT_DEPTH = 8;
const GRAYSCALE_COLOR_TYPE = 0;
const DEFLATE_METHOD = 0;
const ADAPTIVE_FILTERING = 0;
const NO_INTERLACE = 0;
const NULL_SEPARATOR = 0;
const UNCOMPRESSED_TEXT = 0;
const EMPTY_LANGUAGE_TAG = 0;
const EMPTY_TRANSLATED_KEYWORD = 0;

function assertImageSide(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`A PNG ${name} must be a whole number of 1 or more, got ${value}`);
  }
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(typeAndData));

  return Buffer.concat([length, typeAndData, crc]);
}

function grayscaleImageHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(IMAGE_HEADER_BYTES);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(GRAYSCALE_BIT_DEPTH, 8);
  header.writeUInt8(GRAYSCALE_COLOR_TYPE, 9);
  header.writeUInt8(DEFLATE_METHOD, 10);
  header.writeUInt8(ADAPTIVE_FILTERING, 11);
  header.writeUInt8(NO_INTERLACE, 12);

  return header;
}

function blackUnfilteredScanlines(width: number, height: number): Buffer {
  return zlib.deflateSync(Buffer.alloc((width + 1) * height));
}

function textChunkData({ chunkType, keyword, text }: PngTextChunk): Buffer {
  const keywordBytes = Buffer.from(keyword, 'latin1');

  if (chunkType === 'tEXt') {
    return Buffer.concat([keywordBytes, Buffer.from([NULL_SEPARATOR]), Buffer.from(text, 'latin1')]);
  }

  return Buffer.concat([
    keywordBytes,
    Buffer.from([NULL_SEPARATOR, UNCOMPRESSED_TEXT, DEFLATE_METHOD, EMPTY_LANGUAGE_TAG, EMPTY_TRANSLATED_KEYWORD]),
    Buffer.from(text, 'utf8'),
  ]);
}

export function buildPng({ width = 1, height = 1, textChunks = [] }: PngImageOptions = {}): Buffer {
  assertImageSide(width, 'width');
  assertImageSide(height, 'height');

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', grayscaleImageHeader(width, height)),
    ...textChunks.map((textChunk) => pngChunk(textChunk.chunkType, textChunkData(textChunk))),
    pngChunk('IDAT', blackUnfilteredScanlines(width, height)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
