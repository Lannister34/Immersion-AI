import { z } from 'zod';

export const MAX_REPLY_TOKEN_LIMIT = 10_000_000;
export const UNLIMITED_REPLY_TOKENS = 'unlimited';

export const ReplyTokenLimitSchema = z.union([
  z.number().int().positive().max(MAX_REPLY_TOKEN_LIMIT),
  z.literal(UNLIMITED_REPLY_TOKENS),
]);
export type ReplyTokenLimit = z.infer<typeof ReplyTokenLimitSchema>;
