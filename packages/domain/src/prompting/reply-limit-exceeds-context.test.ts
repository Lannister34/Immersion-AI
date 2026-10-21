import { describe, expect, it } from 'vitest';

import { replyLimitExceedsContext } from './reply-limit-exceeds-context.js';

describe('replyLimitExceedsContext', () => {
  it('flags a reply limit equal to the context size, the 32768/32768 preset that dropped the history', () => {
    expect(replyLimitExceedsContext({ maxContextLength: 32_768, maxTokens: 32_768 })).toBe(true);
  });

  it('flags a reply limit above the context size', () => {
    expect(replyLimitExceedsContext({ maxContextLength: 4096, maxTokens: 4097 })).toBe(true);
    expect(replyLimitExceedsContext({ maxContextLength: 1, maxTokens: 10_000_000 })).toBe(true);
  });

  it('accepts a reply limit one token below the context size', () => {
    expect(replyLimitExceedsContext({ maxContextLength: 32_768, maxTokens: 32_767 })).toBe(false);
    expect(replyLimitExceedsContext({ maxContextLength: 2, maxTokens: 1 })).toBe(false);
  });

  it('accepts the contract maximum context with a smaller reply limit', () => {
    expect(replyLimitExceedsContext({ maxContextLength: 10_000_000, maxTokens: 9_999_999 })).toBe(false);
  });

  it('treats a context size of 0 as no window, so no reply limit exceeds it', () => {
    expect(replyLimitExceedsContext({ maxContextLength: 0, maxTokens: 1 })).toBe(false);
    expect(replyLimitExceedsContext({ maxContextLength: 0, maxTokens: 10_000_000 })).toBe(false);
  });
});
