import { describe, expect, it } from 'vitest';

import type { ChatCompletionSamplingOptions } from '../../../application/chat-completion-client.js';
import { buildAnthropicSamplingPayload, resolveAnthropicSamplingSupport } from './sampling-policy.js';

const SAMPLING: ChatCompletionSamplingOptions = {
  minP: 0.05,
  presencePenalty: 0.5,
  repeatPenalty: 1.1,
  repeatPenaltyRange: 256,
  temperature: 1.4,
  topK: 40,
  topP: 0.9,
};

function samplingFor(model: string) {
  return buildAnthropicSamplingPayload(SAMPLING, resolveAnthropicSamplingSupport(model));
}

describe('Anthropic sampling policy', () => {
  it.each([
    'claude-opus-4-1',
    'claude-opus-4-5',
    'claude-opus-4-6',
    'claude-sonnet-4-20250514',
    'claude-sonnet-4-5',
    'claude-sonnet-4-6',
    'claude-haiku-4-5',
  ])('never sends temperature together with top_p to Claude 4 models (%s)', (model) => {
    expect(samplingFor(model)).toEqual({ temperature: 1, top_k: 40 });
  });

  it.each([
    'claude-opus-4-7',
    'claude-opus-4-8',
    'claude-opus-5',
    'claude-opus-5-5',
    'claude-sonnet-5',
    'claude-sonnet-5-5',
    'claude-haiku-5-5',
    'claude-fable-5',
    'claude-fable-5-1',
    'claude-mythos-5-1',
  ])('sends no sampling parameters to Opus 4.7 and every later model (%s)', (model) => {
    expect(samplingFor(model)).toEqual({});
  });

  it.each([
    'claude-opus-5-9',
    'qwen3-32b',
    '',
    'Модель',
  ])('treats an unknown model id as sampling-free (%s)', (model) => {
    expect(resolveAnthropicSamplingSupport(model)).toBe('none');
  });

  it('keeps temperature, top_p and top_k for Claude 3', () => {
    expect(samplingFor('claude-3-5-sonnet-20241022')).toEqual({ temperature: 1, top_k: 40, top_p: 0.9 });
  });

  it('leaves top_p out for Claude 3 when it does not narrow sampling', () => {
    expect(buildAnthropicSamplingPayload({ ...SAMPLING, topP: 1 }, 'full')).toEqual({ temperature: 1, top_k: 40 });
  });

  it('leaves top_k out when it is disabled', () => {
    expect(buildAnthropicSamplingPayload({ ...SAMPLING, topK: 0 }, 'temperature-and-top-k')).toEqual({
      temperature: 1,
    });
  });

  it.each([
    ['anthropic/claude-sonnet-4-5', 'temperature-and-top-k'],
    ['us.anthropic.claude-opus-4-7-v1:0', 'none'],
    ['anthropic.claude-haiku-4-5-20251001-v1:0', 'temperature-and-top-k'],
    ['claude-opus-4-5@20251101', 'temperature-and-top-k'],
    ['Claude-Sonnet-4-6', 'temperature-and-top-k'],
  ] as const)('reads proxy, cloud and mixed-case ids from their first claude- (%s)', (model, support) => {
    expect(resolveAnthropicSamplingSupport(model)).toBe(support);
  });
});
