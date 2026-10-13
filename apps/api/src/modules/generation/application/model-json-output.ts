import { ProviderGenerationError } from './generation-errors.js';

const VALID_JSON_ESCAPES = '"\\/bfnrtu';

function repairModelJson(raw: string): string {
  let repaired = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw.charAt(index);

    if (escaped) {
      if (VALID_JSON_ESCAPES.includes(character)) {
        repaired += character;
      } else {
        repaired = repaired.slice(0, -1) + character;
      }

      escaped = false;
      continue;
    }

    if (character === '\\' && inString) {
      repaired += character;
      escaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      repaired += character;
    } else if (inString) {
      if (character === '\n') {
        repaired += '\\n';
      } else if (character === '\r') {
        repaired += '\\r';
      } else if (character === '\t') {
        repaired += '\\t';
      } else {
        repaired += character;
      }
    } else if (!isTrailingCommaAt(raw, index)) {
      repaired += character;
    }
  }

  return repaired;
}

function isTrailingCommaAt(raw: string, position: number): boolean {
  if (raw.charAt(position) !== ',') {
    return false;
  }

  for (let index = position + 1; index < raw.length; index += 1) {
    const character = raw.charAt(index);

    if (/\s/u.test(character)) {
      continue;
    }

    return character === '}' || character === ']';
  }

  return false;
}

export function extractJsonFromModelOutput(text: string): unknown {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/u);
  const source = codeBlockMatch?.[1] ?? text;
  const firstBrace = source.search(/[{[]/u);
  const lastBrace = Math.max(source.lastIndexOf('}'), source.lastIndexOf(']'));

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new ProviderGenerationError('Provider returned output without a JSON object. Try again.');
  }

  const raw = source.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(repairModelJson(raw));
    } catch {
      throw new ProviderGenerationError('Provider returned malformed JSON output. Try again.');
    }
  }
}

export function asJsonRecord(value: unknown, subject: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProviderGenerationError(`Provider returned unexpected JSON shape for ${subject}. Try again.`);
  }

  return value as Record<string, unknown>;
}
