import type { SamplerPresetInput } from '@immersion/contracts/settings';

export const DEFAULT_SAMPLER_VALUES = {
  contextTrimStrategy: 'trim_middle',
  maxContextLength: 8192,
  maxTokens: 600,
  minP: 0.02,
  presencePenalty: 0,
  repeatPenalty: 1.05,
  repeatPenaltyRange: 2048,
  temperature: 1,
  topK: 0,
  topP: 1,
} satisfies Omit<SamplerPresetInput, 'name'>;

export function resetSamplerToDefaults(form: SamplerPresetInput): SamplerPresetInput {
  return { ...DEFAULT_SAMPLER_VALUES, name: form.name };
}
