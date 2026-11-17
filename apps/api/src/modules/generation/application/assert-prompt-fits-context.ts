import type { ChatReplyGenerationPlan } from '../../prompting/index.js';
import { PromptExceedsContextError } from './generation-errors.js';

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
    promptBudget: tokenEstimate.promptBudget,
    reason: budgetStatus,
  });
}
