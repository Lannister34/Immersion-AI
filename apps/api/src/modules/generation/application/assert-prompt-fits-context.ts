import type { ChatReplyGenerationPlan } from '../../prompting/index.js';
import { PromptExceedsContextError } from './generation-errors.js';

function pendingContextThatWouldHelp(contextWindow: ChatReplyGenerationPlan['contextWindow']): number | null {
  const { pendingSize, size } = contextWindow;

  return pendingSize !== null && pendingSize > size ? pendingSize : null;
}

export function assertPromptFitsContext(plan: ChatReplyGenerationPlan): void {
  const { budgetStatus, tokenEstimate } = plan.prompt.diagnostics;
  const maxTokens = plan.providerRequest.maxTokens;

  if (maxTokens === null) {
    return;
  }

  if (budgetStatus !== 'reply-exceeds-context' && budgetStatus !== 'system-exceeds-budget') {
    return;
  }

  throw new PromptExceedsContextError({
    contextWindow: plan.contextWindow.size,
    fixedPromptTokens: tokenEstimate.finalTotal,
    maxTokens,
    pendingContextSize: pendingContextThatWouldHelp(plan.contextWindow),
    promptBudget: tokenEstimate.promptBudget,
    reason: budgetStatus,
  });
}
