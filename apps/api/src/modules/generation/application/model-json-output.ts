import { ProviderGenerationError } from './generation-errors.js';

const VALID_JSON_ESCAPES = '"\\/bfnrtu';

/**
 * Repairs common LLM JSON mistakes: unescaped control characters and invalid
 * escape sequences inside string values, plus trailing commas.
 * Ported from the legacy ai-generation route.
 */
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
        // Invalid escape like \* or \' — drop the backslash, keep the character.
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
    } else if (character === ',' && isTrailingComma(raw, index)) {
      // Висячая запятая перед } или ] — убираем только вне строк,
      // чтобы не портить запятые внутри текстовых значений.
    } else {
      repaired += character;
    }
  }

  return repaired;
}

function isTrailingComma(raw: string, commaIndex: number): boolean {
  for (let index = commaIndex + 1; index < raw.length; index += 1) {
    const character = raw.charAt(index);

    if (/\s/u.test(character)) {
      continue;
    }

    return character === '}' || character === ']';
  }

  return false;
}

/**
 * Extracts a JSON value from raw model output: strips markdown code fences,
 * slices to the outermost braces, and repairs common LLM JSON errors.
 * Throws ProviderGenerationError when no parseable JSON is present.
 */
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
    // Fall through to the repaired variant.
  }

  try {
    return JSON.parse(repairModelJson(raw));
  } catch {
    throw new ProviderGenerationError('Provider returned malformed JSON output. Try again.');
  }
}

export function asJsonRecord(value: unknown, subject: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProviderGenerationError(`Provider returned unexpected JSON shape for ${subject}. Try again.`);
  }

  return value as Record<string, unknown>;
}
