import type { PromptContextWindow } from '@immersion/contracts/generation';
import { resolveContextWindowSize, resolvePendingContextSize } from '@immersion/domain/prompting';

export function resolvePromptContextWindow(
  maxContextLength: number,
  providerContextSize: number | null,
): PromptContextWindow {
  const size = resolveContextWindowSize(maxContextLength, providerContextSize);
  const isRuntimeWindow = providerContextSize !== null && providerContextSize > 0;

  return {
    pendingSize: resolvePendingContextSize(maxContextLength, providerContextSize),
    size,
    source: isRuntimeWindow ? 'runtime' : 'preset',
  };
}
