import { readFileSync } from 'node:fs';
import { causeOf } from '../errors/cause-of.mjs';

const ABSENT_FILE_CODES = new Set(['ENOENT', 'ENOTDIR']);

export function readTextIfPresent(absolutePath, label, GateError) {
  try {
    return readFileSync(absolutePath, 'utf8');
  } catch (error) {
    if (ABSENT_FILE_CODES.has(error?.code)) return null;
    throw new GateError(`${label} cannot be read: ${causeOf(error)}`);
  }
}
