export const PLAIN_FILE_NAME_MAX_LENGTH = 200;

const FORBIDDEN_CHARACTERS = new Set(['/', '\\', ':']);
const FIRST_PRINTABLE_CODE_POINT = 0x20;
const DELETE_CODE_POINT = 0x7f;
const FIRST_SURROGATE = 0xd800;
const LAST_SURROGATE = 0xdfff;

export function isForbiddenFileNameCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  const isControl = codePoint < FIRST_PRINTABLE_CODE_POINT || codePoint === DELETE_CODE_POINT;
  const isLoneSurrogate = character.length === 1 && codePoint >= FIRST_SURROGATE && codePoint <= LAST_SURROGATE;
  return isControl || isLoneSurrogate || FORBIDDEN_CHARACTERS.has(character);
}

export function isPlainFileName(value: string): boolean {
  if (value.length === 0 || value.length > PLAIN_FILE_NAME_MAX_LENGTH) return false;
  if (value.startsWith('.') || value.endsWith('.') || value.endsWith(' ')) return false;

  for (const character of value) {
    if (isForbiddenFileNameCharacter(character)) return false;
  }

  return true;
}
