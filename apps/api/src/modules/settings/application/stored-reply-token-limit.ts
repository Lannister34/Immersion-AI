import { MAX_REPLY_TOKEN_LIMIT, type ReplyTokenLimit, UNLIMITED_REPLY_TOKENS } from '@immersion/contracts/common';

export function readStoredReplyTokenLimit(value: unknown): ReplyTokenLimit | null {
  if (value === UNLIMITED_REPLY_TOKENS) {
    return UNLIMITED_REPLY_TOKENS;
  }

  if (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_REPLY_TOKEN_LIMIT) {
    return value;
  }

  return null;
}
