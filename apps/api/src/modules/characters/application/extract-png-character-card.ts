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

function readTextChunks(buffer: Buffer): PngTextChunk[] {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new InvalidCharacterCardError('File is not a valid PNG.');
  }

  const chunks: PngTextChunk[] = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === 'tEXt') {
      const nullIndex = data.indexOf(0);
      if (nullIndex > 0) {
        const keyword = data.subarray(0, nullIndex).toString('latin1');
        const text = data.subarray(nullIndex + 1).toString('latin1');
        chunks.push({ keyword, text });
      }
    } else if (type === 'iTXt') {
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
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4;
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

export function extractPngCharacterCard(pngBuffer: Buffer): ExtractedCharacterCard {
  const chunks = readTextChunks(pngBuffer);
  const candidate =
    chunks.find((chunk) => chunk.keyword === 'ccv3') ?? chunks.find((chunk) => chunk.keyword === 'chara');
  if (!candidate) {
    throw new InvalidCharacterCardError(
      'PNG does not contain a SillyTavern character card (chara / ccv3 chunk missing).',
    );
  }

  let decoded: string;
  try {
    decoded = Buffer.from(candidate.text, 'base64').toString('utf8');
  } catch {
    throw new InvalidCharacterCardError('Character card payload is not valid base64.');
  }

  let parsed: CharacterCardV2 | CharacterCardData;
  try {
    parsed = JSON.parse(decoded) as CharacterCardV2 | CharacterCardData;
  } catch {
    throw new InvalidCharacterCardError('Character card payload is not valid JSON.');
  }

  const data: CharacterCardData =
    parsed && typeof parsed === 'object' && 'data' in parsed && parsed.data && typeof parsed.data === 'object'
      ? (parsed.data as CharacterCardData)
      : (parsed as CharacterCardData);

  return projectCardData(data);
}
