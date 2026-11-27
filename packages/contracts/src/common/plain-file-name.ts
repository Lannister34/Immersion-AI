export const PLAIN_FILE_NAME_MAX_LENGTH = 200;

const FORBIDDEN_CHARACTERS = new Set(['/', '\\', ':']);
const FIRST_PRINTABLE_CODE_POINT = 0x20;
const DELETE_CODE_POINT = 0x7f;

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint < FIRST_PRINTABLE_CODE_POINT || codePoint === DELETE_CODE_POINT;
}

export function isPlainFileName(value: string): boolean {
  if (value.length === 0 || value.length > PLAIN_FILE_NAME_MAX_LENGTH) return false;
  if (value.startsWith('.') || value.endsWith('.') || value.endsWith(' ')) return false;

  for (const character of value) {
    if (FORBIDDEN_CHARACTERS.has(character) || isControlCharacter(character)) return false;
  }

  return true;
}
