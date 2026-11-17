import { replyLimitExceedsContext } from './reply-limit-exceeds-context.js';
import type { ReplyTokenLimit } from './reply-token-limit.js';

export const UNLIMITED_REPLY_RESERVATION = 1024;

export interface PromptBudgetSettings {
  maxContextLength: number;
  maxTokens: ReplyTokenLimit;
  serverContextSize: number | null;
}

export type PromptBudget =
  | { kind: 'unbounded' }
  | { contextWindow: number; kind: 'reply-exceeds-context'; maxTokens: number }
  | { contextWindow: number; kind: 'bounded'; promptBudget: number; replyReservation: number };

export function resolveContextWindowSize(maxContextLength: number, serverContextSize: number | null): number {
  if (
    serverContextSize !== null &&
    serverContextSize > 0 &&
    (maxContextLength <= 0 || serverContextSize < maxContextLength)
  ) {
    return serverContextSize;
  }

  return Math.max(0, maxContextLength);
}

export function computePromptBudget(settings: PromptBudgetSettings): PromptBudget {
  const contextWindow = resolveContextWindowSize(settings.maxContextLength, settings.serverContextSize);

  if (contextWindow <= 0) {
    return { kind: 'unbounded' };
  }

  if (settings.maxTokens !== 'unlimited') {
    if (replyLimitExceedsContext({ maxContextLength: contextWindow, maxTokens: settings.maxTokens })) {
      return { contextWindow, kind: 'reply-exceeds-context', maxTokens: settings.maxTokens };
    }

    return {
      contextWindow,
      kind: 'bounded',
      promptBudget: contextWindow - settings.maxTokens,
      replyReservation: settings.maxTokens,
    };
  }

  const realWindow =
    settings.serverContextSize !== null && settings.serverContextSize > 0 ? settings.serverContextSize : contextWindow;
  const minimumReplyRoom = Math.min(UNLIMITED_REPLY_RESERVATION, Math.floor(realWindow / 2));
  const promptBudget = Math.min(contextWindow, realWindow - minimumReplyRoom);

  return { contextWindow, kind: 'bounded', promptBudget, replyReservation: realWindow - promptBudget };
}
