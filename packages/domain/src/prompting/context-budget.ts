import { replyLimitExceedsContext } from './reply-limit-exceeds-context.js';
import type { ReplyTokenLimit } from './reply-token-limit.js';

export const MINIMUM_UNLIMITED_REPLY_ROOM = 2048;
export const UNLIMITED_REPLY_ROOM_SHARE = 8;

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
  if (serverContextSize !== null && serverContextSize > 0) {
    return serverContextSize;
  }

  return Math.max(0, maxContextLength);
}

export function resolvePendingContextSize(maxContextLength: number, serverContextSize: number | null): number | null {
  if (serverContextSize === null || serverContextSize <= 0 || maxContextLength <= 0) {
    return null;
  }

  return maxContextLength === serverContextSize ? null : maxContextLength;
}

export function unlimitedReplyRoom(contextWindow: number): number {
  const room = Math.max(MINIMUM_UNLIMITED_REPLY_ROOM, Math.ceil(contextWindow / UNLIMITED_REPLY_ROOM_SHARE));

  return Math.min(room, Math.floor(contextWindow / 2));
}

export function computePromptBudget(settings: PromptBudgetSettings): PromptBudget {
  const contextWindow = resolveContextWindowSize(settings.maxContextLength, settings.serverContextSize);

  if (contextWindow <= 0) {
    return { kind: 'unbounded' };
  }

  if (settings.maxTokens === 'unlimited') {
    const replyReservation = unlimitedReplyRoom(contextWindow);

    return { contextWindow, kind: 'bounded', promptBudget: contextWindow - replyReservation, replyReservation };
  }

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
