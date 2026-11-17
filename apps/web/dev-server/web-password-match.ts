import { createHash, timingSafeEqual } from 'node:crypto';

function digestOf(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function matchesWebPassword(candidate: string, password: string): boolean {
  return timingSafeEqual(digestOf(candidate), digestOf(password));
}
