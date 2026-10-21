export interface ReplyBudgetSettings {
  maxContextLength: number;
  maxTokens: number;
}

export function replyLimitExceedsContext(settings: ReplyBudgetSettings): boolean {
  return settings.maxContextLength > 0 && settings.maxTokens >= settings.maxContextLength;
}
