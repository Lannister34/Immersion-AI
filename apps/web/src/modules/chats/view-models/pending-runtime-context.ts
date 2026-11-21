import type { PromptContextWindow } from '@immersion/contracts/generation';

export interface PendingRuntimeContext {
  isGenerating: boolean;
  isPreviewFetching: boolean;
  pendingContextSize: number;
  runningContextSize: number;
}

export function toPendingRuntimeContext(
  contextWindow: PromptContextWindow | undefined,
  isGenerating: boolean,
  isPreviewFetching: boolean,
): PendingRuntimeContext | null {
  if (!contextWindow || contextWindow.source !== 'runtime' || contextWindow.pendingSize === null) {
    return null;
  }

  return {
    isGenerating,
    isPreviewFetching,
    pendingContextSize: contextWindow.pendingSize,
    runningContextSize: contextWindow.size,
  };
}
