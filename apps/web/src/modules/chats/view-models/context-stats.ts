import type { ChatReplyPromptPreviewResponse, TokenCountMethod } from '@immersion/contracts/generation';

export interface ContextStats {
  totalTokens: number;
  contextWindow: number;
  replyLimit: number;
  messageCount: number;
  trimmedMessageCount: number;
  onlyLastMessageFits: boolean;
  systemTokens: number;
  transcriptTokens: number;
  tokenCountMethod: TokenCountMethod;
  presetName?: string;
  modelName?: string | null;
}

export function toContextStats(preview: ChatReplyPromptPreviewResponse | undefined): ContextStats | undefined {
  if (!preview) return undefined;
  const { budgetStatus, tokenCountMethod, tokenEstimate, transcriptMessageCount, trimmedMessageCount } =
    preview.diagnostics;
  return {
    totalTokens: tokenEstimate.finalTotal,
    contextWindow: preview.effectiveSettings.sampling.maxContextLength,
    replyLimit: preview.effectiveSettings.sampling.maxTokens,
    messageCount: transcriptMessageCount,
    trimmedMessageCount,
    onlyLastMessageFits: budgetStatus === 'reply-exceeds-context',
    systemTokens: tokenEstimate.system,
    transcriptTokens: tokenEstimate.transcriptAfterTrim,
    tokenCountMethod,
    presetName: preview.effectiveSettings.samplerPresetName,
    modelName: preview.effectiveSettings.modelName,
  };
}
