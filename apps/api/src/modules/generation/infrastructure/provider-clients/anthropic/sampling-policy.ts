import type { ChatCompletionSamplingOptions } from '../../../application/chat-completion-client.js';
import type { AnthropicSampling } from './request-wire.js';

export type AnthropicSamplingSupport = 'full' | 'none' | 'temperature-and-top-k';

const ANTHROPIC_SAMPLING_SUPPORT: ReadonlyArray<readonly [prefix: string, support: AnthropicSamplingSupport]> = [
  ['claude-opus-4-7', 'none'],
  ['claude-opus-4-8', 'none'],
  ['claude-opus-4', 'temperature-and-top-k'],
  ['claude-sonnet-4', 'temperature-and-top-k'],
  ['claude-haiku-4', 'temperature-and-top-k'],
  ['claude-3', 'full'],
];

export function resolveAnthropicSamplingSupport(model: string): AnthropicSamplingSupport {
  const id = model.toLowerCase();
  const start = id.indexOf('claude-');

  if (start < 0) {
    return 'none';
  }

  const claudeId = id.slice(start);

  return ANTHROPIC_SAMPLING_SUPPORT.find(([prefix]) => claudeId.startsWith(prefix))?.[1] ?? 'none';
}

export function buildAnthropicSamplingPayload(
  sampling: ChatCompletionSamplingOptions,
  support: AnthropicSamplingSupport,
): AnthropicSampling {
  if (support === 'none') {
    return {};
  }

  return {
    temperature: Math.min(Math.max(sampling.temperature, 0), 1),
    ...(sampling.topK > 0 ? { top_k: Math.round(sampling.topK) } : {}),
    ...(support === 'full' && sampling.topP > 0 && sampling.topP < 1 ? { top_p: sampling.topP } : {}),
  };
}
