import type { PromptContextWindow } from '@immersion/contracts/generation';

export function resolvePromptContextWindow(
  maxContextLength: number,
  providerContextSize: number | null,
): PromptContextWindow {
  if (providerContextSize !== null && (maxContextLength <= 0 || providerContextSize < maxContextLength)) {
    return { size: providerContextSize, source: 'runtime' };
  }

  return { size: maxContextLength, source: 'preset' };
}
