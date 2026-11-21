import { describe, expect, it } from 'vitest';

import {
  computePromptBudget,
  resolveContextWindowSize,
  resolvePendingContextSize,
  unlimitedReplyRoom,
} from './context-budget.js';

describe('resolveContextWindowSize', () => {
  it('is the window the running server has, whatever the preset says, so the meter never claims more', () => {
    expect(resolveContextWindowSize(32_256, 48_000)).toBe(48_000);
    expect(resolveContextWindowSize(65_536, 48_000)).toBe(48_000);
    expect(resolveContextWindowSize(0, 8192)).toBe(8192);
  });

  it('is the preset context when no server window is known, as for a cloud provider', () => {
    expect(resolveContextWindowSize(32_256, null)).toBe(32_256);
    expect(resolveContextWindowSize(4096, 0)).toBe(4096);
    expect(resolveContextWindowSize(0, null)).toBe(0);
  });
});

describe('resolvePendingContextSize', () => {
  it('reports the preset context as pending while the server runs another one', () => {
    expect(resolvePendingContextSize(48_000, 32_256)).toBe(48_000);
    expect(resolvePendingContextSize(16_384, 32_256)).toBe(16_384);
  });

  it('reports nothing pending when they agree, when no server window is known, or when the preset sets none', () => {
    expect(resolvePendingContextSize(48_000, 48_000)).toBeNull();
    expect(resolvePendingContextSize(48_000, null)).toBeNull();
    expect(resolvePendingContextSize(0, 48_000)).toBeNull();
  });
});

describe('unlimitedReplyRoom', () => {
  it('keeps an eighth of the window for the reply, 6000 of 48000', () => {
    expect(unlimitedReplyRoom(48_000)).toBe(6000);
  });

  it('keeps at least 2048 tokens for the reply', () => {
    expect(unlimitedReplyRoom(8192)).toBe(2048);
    expect(unlimitedReplyRoom(16_384)).toBe(2048);
  });

  it('never takes more than half of a tiny window', () => {
    expect(unlimitedReplyRoom(1000)).toBe(500);
  });
});

describe('computePromptBudget', () => {
  it('leaves an unlimited reply max(2048, window / 8) of the running window', () => {
    expect(
      computePromptBudget({ maxContextLength: 48_000, maxTokens: 'unlimited', serverContextSize: 48_000 }),
    ).toEqual({
      contextWindow: 48_000,
      kind: 'bounded',
      promptBudget: 42_000,
      replyReservation: 6000,
    });
  });

  it('budgets against the running window while a different preset context is pending', () => {
    expect(
      computePromptBudget({ maxContextLength: 48_000, maxTokens: 'unlimited', serverContextSize: 32_256 }),
    ).toEqual({
      contextWindow: 32_256,
      kind: 'bounded',
      promptBudget: 32_256 - 4032,
      replyReservation: 4032,
    });
  });

  it('budgets a cloud provider by the preset context', () => {
    expect(
      computePromptBudget({ maxContextLength: 8192, maxTokens: 'unlimited', serverContextSize: null }),
    ).toMatchObject({
      promptBudget: 6144,
      replyReservation: 2048,
    });
  });

  it('is unbounded when neither the preset nor the server gives a window', () => {
    expect(computePromptBudget({ maxContextLength: 0, maxTokens: 'unlimited', serverContextSize: null })).toEqual({
      kind: 'unbounded',
    });
    expect(computePromptBudget({ maxContextLength: 0, maxTokens: 512, serverContextSize: null })).toEqual({
      kind: 'unbounded',
    });
  });

  it('reserves an explicit reply limit inside the window', () => {
    expect(computePromptBudget({ maxContextLength: 32_256, maxTokens: 32_225, serverContextSize: null })).toEqual({
      contextWindow: 32_256,
      kind: 'bounded',
      promptBudget: 31,
      replyReservation: 32_225,
    });
    expect(computePromptBudget({ maxContextLength: 65_536, maxTokens: 2048, serverContextSize: 48_000 })).toMatchObject(
      {
        promptBudget: 45_952,
      },
    );
  });

  it('reports an explicit reply limit equal to or above the window as reply-exceeds-context', () => {
    expect(computePromptBudget({ maxContextLength: 32_768, maxTokens: 32_768, serverContextSize: null })).toEqual({
      contextWindow: 32_768,
      kind: 'reply-exceeds-context',
      maxTokens: 32_768,
    });
    expect(
      computePromptBudget({ maxContextLength: 65_536, maxTokens: 50_000, serverContextSize: 48_000 }),
    ).toMatchObject({
      kind: 'reply-exceeds-context',
    });
  });
});
