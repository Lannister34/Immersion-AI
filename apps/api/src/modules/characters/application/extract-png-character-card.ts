const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class InvalidCharacterCardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCharacterCardError';
  }
}

interface PngTextChunk {
  keyword: string;
  text: string;
}

interface PngChunkSpan {
  end: number;
  length: number;
  start: number;
  type: string;
}

function readChunkSpans(buffer: Buffer): PngChunkSpan[] {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new InvalidCharacterCardError('File is not a valid PNG.');
  }

  const spans: PngChunkSpan[] = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    const totalEnd = dataEnd + 4;
    spans.push({ end: totalEnd, length, start: offset, type });
    offset = totalEnd;
    if (type === 'IEND') break;
  }

  return spans;
}

function readTextChunks(buffer: Buffer): PngTextChunk[] {
  const spans = readChunkSpans(buffer);
  const chunks: PngTextChunk[] = [];

  for (const span of spans) {
    const dataStart = span.start + 8;
    const data = buffer.subarray(dataStart, dataStart + span.length);

    if (span.type === 'tEXt') {
      const nullIndex = data.indexOf(0);
      if (nullIndex > 0) {
        const keyword = data.subarray(0, nullIndex).toString('latin1');
        const text = data.subarray(nullIndex + 1).toString('latin1');
        chunks.push({ keyword, text });
      }
    } else if (span.type === 'iTXt') {
      // iTXt: keyword \0 compression_flag(1) compression_method(1) language_tag \0 translated_keyword \0 text
      const nullIndex = data.indexOf(0);
      if (nullIndex > 0) {
        const keyword = data.subarray(0, nullIndex).toString('latin1');
        const compressionFlag = data[nullIndex + 1] ?? 0;
        if (compressionFlag === 0) {
          // Skip language tag and translated keyword
          let cursor = nullIndex + 3;
          const langEnd = data.indexOf(0, cursor);
          if (langEnd >= 0) cursor = langEnd + 1;
          const translatedEnd = data.indexOf(0, cursor);
          if (translatedEnd >= 0) cursor = translatedEnd + 1;
          const text = data.subarray(cursor).toString('utf8');
          chunks.push({ keyword, text });
        }
      }
    } else if (span.type === 'IEND') {
      break;
    }
  }

  return chunks;
}

interface CharacterCardData {
  description?: unknown;
  example_dialogue?: unknown;
  first_mes?: unknown;
  first_message?: unknown;
  mes_example?: unknown;
  name?: unknown;
  personality?: unknown;
  scenario?: unknown;
  system_prompt?: unknown;
  tags?: unknown;
}

interface CharacterCardV2 {
  data?: CharacterCardData;
  spec?: string;
  spec_version?: string;
}

export interface ExtractedCharacterCard {
  description: string;
  exampleDialogue: string;
  firstMessage: string;
  name: string;
  personality: string;
  scenario: string;
  systemPrompt: string;
  tags: string[];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim().length > 0) result.push(entry.trim());
  }
  return result;
}

function projectCardData(data: CharacterCardData): ExtractedCharacterCard {
  return {
    description: asString(data.description),
    exampleDialogue: asString(data.mes_example ?? data.example_dialogue),
    firstMessage: asString(data.first_mes ?? data.first_message),
    name: asString(data.name).trim() || 'Imported character',
    personality: asString(data.personality),
    scenario: asString(data.scenario),
    systemPrompt: asString(data.system_prompt),
    tags: asStringArray(data.tags),
  };
}

function decodeCharaJson(text: string): CharacterCardV2 | CharacterCardData {
  let decoded: string;
  try {
    decoded = Buffer.from(text, 'base64').toString('utf8');
  } catch {
    throw new InvalidCharacterCardError('Character card payload is not valid base64.');
  }
  try {
    return JSON.parse(decoded) as CharacterCardV2 | CharacterCardData;
  } catch {
    throw new InvalidCharacterCardError('Character card payload is not valid JSON.');
  }
}

function extractDataObject(parsed: CharacterCardV2 | CharacterCardData): CharacterCardData {
  return parsed && typeof parsed === 'object' && 'data' in parsed && parsed.data && typeof parsed.data === 'object'
    ? (parsed.data as CharacterCardData)
    : (parsed as CharacterCardData);
}

function textChunkKeywordOf(buffer: Buffer, span: PngChunkSpan): string | null {
  if (span.type !== 'tEXt' && span.type !== 'iTXt') return null;
  const dataStart = span.start + 8;
  const data = buffer.subarray(dataStart, dataStart + span.length);
  const nullIndex = data.indexOf(0);
  if (nullIndex <= 0) return null;
  return data.subarray(0, nullIndex).toString('latin1');
}

function isCharacterCardKeyword(keyword: string | null): boolean {
  return keyword === 'chara' || keyword === 'ccv3';
}

/** True when the buffer is a PNG carrying a SillyTavern character card chunk (chara / ccv3). */
export function pngContainsCharacterCard(pngBuffer: Buffer): boolean {
  let spans: PngChunkSpan[];
  try {
    spans = readChunkSpans(pngBuffer);
  } catch (error) {
    if (error instanceof InvalidCharacterCardError) return false;
    throw error;
  }
  return spans.some((span) => isCharacterCardKeyword(textChunkKeywordOf(pngBuffer, span)));
}

/** Removes chara / ccv3 chunks so the PNG can be stored as a plain avatar image. */
export function stripPngCharacterCardChunks(pngBuffer: Buffer): Buffer {
  const spans = readChunkSpans(pngBuffer);
  const dropped = spans.filter((span) => isCharacterCardKeyword(textChunkKeywordOf(pngBuffer, span)));
  if (dropped.length === 0) return pngBuffer;

  const parts: Buffer[] = [];
  let cursor = 0;
  for (const span of dropped) {
    parts.push(pngBuffer.subarray(cursor, span.start));
    cursor = span.end;
  }
  parts.push(pngBuffer.subarray(cursor));
  return Buffer.concat(parts);
}

export function extractPngCharacterCard(pngBuffer: Buffer): ExtractedCharacterCard {
  const chunks = readTextChunks(pngBuffer);
  const candidate =
    chunks.find((chunk) => chunk.keyword === 'ccv3') ?? chunks.find((chunk) => chunk.keyword === 'chara');
  if (!candidate) {
    throw new InvalidCharacterCardError(
      'PNG does not contain a SillyTavern character card (chara / ccv3 chunk missing).',
    );
  }
  return projectCardData(extractDataObject(decodeCharaJson(candidate.text)));
}

export interface CharacterCardPatch {
  description: string;
  exampleDialogue: string;
  firstMessage: string;
  name: string;
  personality: string;
  scenario: string;
  systemPrompt: string;
  tags: string[];
}

let crcTable: Uint32Array | null = null;
function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n >>> 0;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) === 1 ? (0xed_b8_83_20 ^ (c >>> 1)) >>> 0 : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

function computeCrc(buffer: Buffer): number {
  const table = getCrcTable();
  let crc = 0xff_ff_ff_ff;
  for (const byte of buffer) {
    crc = (table[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

function buildTextChunk(keyword: string, text: string): Buffer {
  const keywordBuffer = Buffer.from(keyword, 'latin1');
  const textBuffer = Buffer.from(text, 'latin1');
  const data = Buffer.concat([keywordBuffer, Buffer.from([0x00]), textBuffer]);
  const typeAndData = Buffer.concat([Buffer.from('tEXt', 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(computeCrc(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function applyPatchToData(data: CharacterCardData, patch: CharacterCardPatch): CharacterCardData {
  const next: CharacterCardData & Record<string, unknown> = { ...(data as Record<string, unknown>) };
  next.name = patch.name;
  next.description = patch.description;
  next.personality = patch.personality;
  next.scenario = patch.scenario;
  // Keep both snake_case spellings in sync so downstream tools see consistent values.
  next.first_mes = patch.firstMessage;
  next.first_message = patch.firstMessage;
  next.mes_example = patch.exampleDialogue;
  next.example_dialogue = patch.exampleDialogue;
  next.system_prompt = patch.systemPrompt;
  next.tags = [...patch.tags];
  return next;
}

/**
 * Re-encode an existing SillyTavern PNG character card with patched fields.
 *
 * Preserves the IHDR/IDAT/IEND payload (so the avatar pixels stay intact),
 * keeps any extra metadata in the chara JSON (creator, alternate_greetings, ...),
 * and rewrites the chara / ccv3 tEXt chunk in place. Other chunks are left
 * untouched.
 */
export function writePngCharacterCard(pngBuffer: Buffer, patch: CharacterCardPatch): Buffer {
  const spans = readChunkSpans(pngBuffer);
  if (spans.length === 0) {
    throw new InvalidCharacterCardError('File is not a valid PNG.');
  }

  // Locate target tEXt chunk (prefer ccv3, fall back to chara).
  let targetIndex = -1;
  let targetKeyword: 'ccv3' | 'chara' = 'chara';
  for (const [index, span] of spans.entries()) {
    if (span.type !== 'tEXt') continue;
    const dataStart = span.start + 8;
    const data = pngBuffer.subarray(dataStart, dataStart + span.length);
    const nullIndex = data.indexOf(0);
    if (nullIndex <= 0) continue;
    const keyword = data.subarray(0, nullIndex).toString('latin1');
    if (keyword === 'ccv3') {
      targetIndex = index;
      targetKeyword = 'ccv3';
      break;
    }
    if (keyword === 'chara' && targetIndex === -1) {
      targetIndex = index;
      targetKeyword = 'chara';
    }
  }

  if (targetIndex === -1) {
    throw new InvalidCharacterCardError(
      'PNG does not contain a SillyTavern character card (chara / ccv3 chunk missing).',
    );
  }

  // Decode existing JSON to preserve unknown fields.
  const targetSpan = spans[targetIndex]!;
  const dataStart = targetSpan.start + 8;
  const data = pngBuffer.subarray(dataStart, dataStart + targetSpan.length);
  const nullIndex = data.indexOf(0);
  const existingText = data.subarray(nullIndex + 1).toString('latin1');
  const parsed = decodeCharaJson(existingText);

  let nextEnvelope: CharacterCardV2 | CharacterCardData;
  if (parsed && typeof parsed === 'object' && 'data' in parsed && parsed.data && typeof parsed.data === 'object') {
    const envelope = { ...(parsed as CharacterCardV2 & Record<string, unknown>) };
    envelope.data = applyPatchToData(parsed.data as CharacterCardData, patch);
    nextEnvelope = envelope;
  } else {
    nextEnvelope = applyPatchToData(parsed as CharacterCardData, patch);
  }

  const nextJson = JSON.stringify(nextEnvelope);
  const nextBase64 = Buffer.from(nextJson, 'utf8').toString('base64');
  const nextChunk = buildTextChunk(targetKeyword, nextBase64);

  return Buffer.concat([pngBuffer.subarray(0, targetSpan.start), nextChunk, pngBuffer.subarray(targetSpan.end)]);
}
