import { isForbiddenFileNameCharacter } from '@immersion/contracts/common';

export const FILE_BASE_NAME_MAX_CODE_POINTS = 80;
export const FILE_BASE_NAME_MAX_UTF8_BYTES = 200;

const WINDOWS_RESERVED_CHARACTERS = new Set(['*', '?', '"', '<', '>', '|']);

const WINDOWS_DEVICE_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'CONIN$',
  'CONOUT$',
  ...['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '¹', '²', '³'].flatMap((digit) => [
    `COM${digit}`,
    `LPT${digit}`,
  ]),
]);

function isReplacedCharacter(character: string): boolean {
  return isForbiddenFileNameCharacter(character) || WINDOWS_RESERVED_CHARACTERS.has(character);
}

function truncateToLimits(text: string): string {
  let result = '';
  let codePoints = 0;
  let bytes = 0;
  for (const character of text) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (codePoints === FILE_BASE_NAME_MAX_CODE_POINTS || bytes + characterBytes > FILE_BASE_NAME_MAX_UTF8_BYTES) break;
    result += character;
    codePoints += 1;
    bytes += characterBytes;
  }
  return result;
}

function isWindowsDeviceName(baseName: string): boolean {
  const stem = baseName.split('.', 1)[0] ?? baseName;
  return WINDOWS_DEVICE_NAMES.has(stem.toUpperCase());
}

export function fileBaseNameFrom(text: string, fallback: string): string {
  const replaced = Array.from(text.trim(), (character) => (isReplacedCharacter(character) ? '_' : character)).join('');
  const dotted = replaced
    .replace(/\s+/gu, '_')
    .replace(/\.{2,}/gu, '.')
    .replace(/^\.+/u, '');
  const baseName = truncateToLimits(dotted).replace(/\.+$/u, '') || fallback;
  return isWindowsDeviceName(baseName) ? `_${baseName}` : baseName;
}
