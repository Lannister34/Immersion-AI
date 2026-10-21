import type { ReplyBudgetSettings } from '@immersion/domain/prompting';

export class ReplyLimitExceedsContextError extends Error {
  constructor(readonly settings: ReplyBudgetSettings) {
    super(
      `Лимит ответа (${settings.maxTokens}) должен быть меньше размера контекста (${settings.maxContextLength}): иначе в промпт попадает только последнее сообщение.`,
    );
    this.name = 'ReplyLimitExceedsContextError';
  }
}
