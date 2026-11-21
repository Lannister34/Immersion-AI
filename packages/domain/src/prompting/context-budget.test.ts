import { describe, expect, it } from 'vitest';

import { computePromptBudget, resolveContextWindowSize, UNLIMITED_REPLY_RESERVATION } from './context-budget.js';

describe('resolveContextWindowSize', () => {
  it('takes the smaller of the preset context and a known server window', () => {
    expect(resolveContextWindowSize(32_256, 48_000)).toBe(32_256);
    expect(resolveContextWindowSize(65_536, 48_000)).toBe(48_000);
  });

  it('falls back to the server window when the preset context is 0, and to 0 when neither is known', () => {
    expect(resolveContextWindowSize(0, 8192)).toBe(8192);
    expect(resolveContextWindowSize(0, null)).toBe(0);
  });

  it('ignores a server window of 0 or less', () => {
    expect(resolveContextWindowSize(4096, 0)).toBe(4096);
  });
});

describe('computePromptBudget', () => {
  it('gives history the whole preset context when an unlimited reply runs on a larger server window', () => {
    expect(
      computePromptBudget({ maxContextLength: 32_256, maxTokens: 'unlimited', serverContextSize: 48_000 }),
    ).toEqual({
      contextWindow: 32_256,
      kind: 'bounded',
      promptBudget: 32_256,
      replyReservation: 15_744,
    });
  });

  it('keeps about 1024 tokens for an unlimited reply when the preset context is not smaller than the server window', () => {
    expect(
      computePromptBudget({ maxContextLength: 32_768, maxTokens: 'unlimited', serverContextSize: 32_768 }),
    ).toEqual({
      contextWindow: 32_768,
      kind: 'bounded',
      promptBudget: 32_768 - UNLIMITED_REPLY_RESERVATION,
      replyReservation: UNLIMITED_REPLY_RESERVATION,
    });
  });

  it('keeps about 1024 tokens for an unlimited reply when the server window is unknown', () => {
    expect(
      computePromptBudget({ maxContextLength: 8192, maxTokens: 'unlimited', serverContextSize: null }),
    ).toMatchObject({
      promptBudget: 7168,
      replyReservation: 1024,
    });
  });

  it('keeps at least 1024 tokens for an unlimited reply when the preset context is only slightly below the server window', () => {
    expect(
      computePromptBudget({ maxContextLength: 47_990, maxTokens: 'unlimited', serverContextSize: 48_000 }),
    ).toMatchObject({
      promptBudget: 46_976,
      replyReservation: 1024,
    });
  });

  it('keeps half of a tiny window for an unlimited reply', () => {
    expect(
      computePromptBudget({ maxContextLength: 100, maxTokens: 'unlimited', serverContextSize: null }),
    ).toMatchObject({
      promptBudget: 50,
      replyReservation: 50,
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

  it('reserves an explicit reply limit inside the effective window, as before', () => {
    expect(computePromptBudget({ maxContextLength: 32_256, maxTokens: 32_225, serverContextSize: 48_000 })).toEqual({
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

  it('reports an explicit reply limit equal to or above the effective window as reply-exceeds-context', () => {
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
