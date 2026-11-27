import type { SamplerPresetInput } from './overview.js';

export const DEFAULT_SAMPLING_PARAMETERS = {
  contextTrimStrategy: 'trim_middle',
  maxContextLength: 8192,
  maxTokens: 'unlimited',
  minP: 0.02,
  presencePenalty: 0,
  repeatPenalty: 1.05,
  repeatPenaltyRange: 2048,
  temperature: 1,
  topK: 0,
  topP: 1,
} satisfies Omit<SamplerPresetInput, 'name'>;
