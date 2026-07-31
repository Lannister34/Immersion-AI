import type { ChatReplyPromptPreviewResponse, TokenCountMethod } from '@immersion/contracts/generation';

export interface ContextStats {
  totalTokens: number;
  contextWindow: number;
  messageCount: number;
  systemTokens: number;
  transcriptTokens: number;
  tokenCountMethod: TokenCountMethod;
  presetName?: string;
  modelName?: string | null;
}

export function toContextStats(preview: ChatReplyPromptPreviewResponse | undefined): ContextStats | undefined {
  if (!preview) return undefined;
  const { tokenCountMethod, tokenEstimate, transcriptMessageCount } = preview.diagnostics;
  return {
    totalTokens: tokenEstimate.finalTotal,
    contextWindow: preview.effectiveSettings.sampling.maxContextLength,
    messageCount: transcriptMessageCount,
    systemTokens: tokenEstimate.system,
    transcriptTokens: tokenEstimate.transcriptAfterTrim,
    tokenCountMethod,
    presetName: preview.effectiveSettings.samplerPresetName,
    modelName: preview.effectiveSettings.modelName,
  };
}
