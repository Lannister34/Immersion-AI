import type { ReplyTokenLimit } from './reply-token-limit.js';

export interface ReplyBudgetSettings {
  maxContextLength: number;
  maxTokens: ReplyTokenLimit;
}

export function replyLimitExceedsContext(settings: ReplyBudgetSettings): boolean {
  return (
    settings.maxTokens !== 'unlimited' &&
    settings.maxContextLength > 0 &&
    settings.maxTokens >= settings.maxContextLength
  );
}
