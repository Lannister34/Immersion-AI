import type { ReplyTokenLimit } from '@immersion/contracts/common';
import type { ChatReplyPromptPreviewResponse, TokenCountMethod } from '@immersion/contracts/generation';

export interface ContextStats {
  totalTokens: number;
  contextWindow: number;
  windowFromRuntime: boolean;
  pendingContextSize: number | null;
  replyLimit: ReplyTokenLimit;
  replyReservation: number;
  messageCount: number;
  trimmedMessageCount: number;
  onlyLastMessageFits: boolean;
  promptExceedsBudget: boolean;
  systemTokens: number;
  transcriptTokens: number;
  tokenCountMethod: TokenCountMethod;
  presetName?: string;
  modelName?: string | null;
}

export function toContextStats(preview: ChatReplyPromptPreviewResponse | undefined): ContextStats | undefined {
  if (!preview) return undefined;
  const { budgetStatus, contextWindow, tokenCountMethod, tokenEstimate, transcriptMessageCount, trimmedMessageCount } =
    preview.diagnostics;
  return {
    totalTokens: tokenEstimate.finalTotal,
    contextWindow: contextWindow.size,
    windowFromRuntime: contextWindow.source === 'runtime',
    pendingContextSize: contextWindow.pendingSize,
    replyLimit: preview.effectiveSettings.sampling.maxTokens,
    replyReservation: tokenEstimate.replyReservation,
    messageCount: transcriptMessageCount,
    trimmedMessageCount,
    onlyLastMessageFits: budgetStatus === 'reply-exceeds-context',
    promptExceedsBudget: budgetStatus === 'system-exceeds-budget',
    systemTokens: tokenEstimate.system,
    transcriptTokens: tokenEstimate.transcriptAfterTrim,
    tokenCountMethod,
    presetName: preview.effectiveSettings.samplerPresetName,
    modelName: preview.effectiveSettings.modelName,
  };
}
