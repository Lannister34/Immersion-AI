import type { ReplyTokenLimit } from '@immersion/contracts/common';

export interface ReplyBudgetHint {
  text: string;
  tone: 'muted' | 'warn';
}

function formatTokens(value: number): string {
  return value.toLocaleString('ru-RU');
}

export function describeReplyBudget(maxContextLength: number, maxTokens: ReplyTokenLimit): ReplyBudgetHint {
  if (maxTokens === 'unlimited') {
    return {
      text: 'Без лимита: модель пишет, пока не остановится; если закончится контекст, ответ будет помечен как оборванный',
      tone: 'muted',
    };
  }

  if (maxContextLength <= 0) {
    return { text: `Ответ ограничен ${formatTokens(maxTokens)} токенами`, tone: 'muted' };
  }

  const historyTokens = Math.max(0, maxContextLength - maxTokens);

  return {
    text: `На историю остаётся ${formatTokens(historyTokens)} из ${formatTokens(maxContextLength)} токенов`,
    tone: historyTokens === 0 ? 'warn' : 'muted',
  };
}
