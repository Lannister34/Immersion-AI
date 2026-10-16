import type { SamplerPresetInput } from '@immersion/contracts/settings';

export interface StoredSamplerPreset {
  context_trim_strategy: 'trim_middle' | 'trim_start';
  id: string;
  max_context_length: number;
  max_length: number;
  min_p: number;
  name: string;
  presence_penalty: number;
  rep_pen: number;
  rep_pen_range: number;
  temperature: number;
  top_k: number;
  top_p: number;
}

export function encodeSamplerPreset(id: string, input: SamplerPresetInput): StoredSamplerPreset {
  return {
    context_trim_strategy: input.contextTrimStrategy,
    id,
    max_context_length: input.maxContextLength,
    max_length: input.maxTokens,
    min_p: input.minP,
    name: input.name.trim(),
    presence_penalty: input.presencePenalty,
    rep_pen: input.repeatPenalty,
    rep_pen_range: input.repeatPenaltyRange,
    temperature: input.temperature,
    top_k: input.topK,
    top_p: input.topP,
  };
}
