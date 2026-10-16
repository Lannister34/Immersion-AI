import zlib from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { buildPng } from './png-image.js';

interface ReadChunk {
  readonly type: string;
  readonly data: Buffer;
  readonly crc: number;
  readonly typeAndData: Buffer;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IEND_CRC = 0xae_42_60_82;

function readChunks(png: Buffer): ReadChunk[] {
  const chunks: ReadChunk[] = [];
  let offset = PNG_SIGNATURE.length;

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const typeAndData = png.subarray(offset + 4, offset + 8 + length);
    chunks.push({
      type: typeAndData.subarray(0, 4).toString('ascii'),
      data: typeAndData.subarray(4),
      crc: png.readUInt32BE(offset + 8 + length),
      typeAndData,
    });
    offset += 12 + length;
  }

  return chunks;
}

describe('buildPng', () => {
  it('writes the signature, a header of the requested size, the pixels and the end chunk', () => {
    const png = buildPng({ width: 3, height: 2 });
    const chunks = readChunks(png);

    expect(png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)).toBe(true);
    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(chunks[0]?.data.readUInt32BE(0)).toBe(3);
    expect(chunks[0]?.data.readUInt32BE(4)).toBe(2);
    expect(zlib.inflateSync(chunks[1]?.data ?? Buffer.alloc(0))).toHaveLength((3 + 1) * 2);
  });

  it('computes the chunk CRC that zlib reports', () => {
    const chunks = readChunks(buildPng({ textChunks: [{ chunkType: 'tEXt', keyword: 'Comment', text: 'pixel' }] }));

    expect(chunks.map((chunk) => chunk.crc)).toEqual(chunks.map((chunk) => zlib.crc32(chunk.typeAndData)));
    expect(chunks.at(-1)?.crc).toBe(IEND_CRC);
  });

  it('writes text chunks before the pixels in the order given, iTXt text as UTF-8', () => {
    const chunks = readChunks(
      buildPng({
        textChunks: [
          { chunkType: 'tEXt', keyword: 'Title', text: 'latin' },
          { chunkType: 'iTXt', keyword: 'Description', text: 'Портрет 🐉' },
        ],
      }),
    );

    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'tEXt', 'iTXt', 'IDAT', 'IEND']);
    expect(chunks[1]?.data.toString('latin1')).toBe('Title\u0000latin');
    expect(chunks[2]?.data.subarray('Description'.length + 5).toString('utf8')).toBe('Портрет 🐉');
  });

  it.each([0, -1, 1.5, Number.NaN])('refuses %d as an image side', (side) => {
    expect(() => buildPng({ width: side })).toThrow(RangeError);
    expect(() => buildPng({ height: side })).toThrow(RangeError);
  });
});
