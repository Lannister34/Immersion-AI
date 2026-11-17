import type { PromptContextWindow } from '@immersion/contracts/generation';
import { resolveContextWindowSize } from '@immersion/domain/prompting';

export function resolvePromptContextWindow(
  maxContextLength: number,
  providerContextSize: number | null,
): PromptContextWindow {
  const size = resolveContextWindowSize(maxContextLength, providerContextSize);
  const isRuntimeWindow = size === providerContextSize && size !== maxContextLength;

  return { size, source: isRuntimeWindow ? 'runtime' : 'preset' };
}
