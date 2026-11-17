import { describe, expect, it } from 'vitest';

import { describeReplyBudget, type ReplyBudgetHint } from './reply-budget-hint';

function withPlainSpaces(hint: ReplyBudgetHint): ReplyBudgetHint {
  return { ...hint, text: hint.text.replace(/\u00a0/gu, ' ') };
}

describe('describeReplyBudget', () => {
  it('shows how many tokens stay for the history when a limit is set', () => {
    expect(withPlainSpaces(describeReplyBudget(32_256, 2048))).toEqual({
      text: 'На историю остаётся 30 208 из 32 256 токенов',
      tone: 'muted',
    });
  });

  it('shows zero tokens for the history, highlighted, when the limit takes the whole context, and the 31 of the 32225/32256 preset', () => {
    expect(withPlainSpaces(describeReplyBudget(32_256, 32_256))).toEqual({
      text: 'На историю остаётся 0 из 32 256 токенов',
      tone: 'warn',
    });
    expect(describeReplyBudget(32_256, 40_000).tone).toBe('warn');
    expect(withPlainSpaces(describeReplyBudget(32_256, 32_225))).toEqual({
      text: 'На историю остаётся 31 из 32 256 токенов',
      tone: 'muted',
    });
  });

  it('describes no limit without a number', () => {
    expect(describeReplyBudget(32_256, 'unlimited').text).toContain('Без лимита');
  });

  it('names the bare limit when the context is not set', () => {
    expect(describeReplyBudget(0, 512).text).toBe('Ответ ограничен 512 токенами');
  });
});
