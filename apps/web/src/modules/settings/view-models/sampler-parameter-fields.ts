import type { SamplerPresetInput } from '@immersion/contracts/settings';

export type SamplerParameterKey = Exclude<keyof SamplerPresetInput, 'contextTrimStrategy' | 'name'>;

export interface SamplerParameterField {
  hint: string;
  key: SamplerParameterKey;
  label: string;
  step: number;
  stepCeiling: number;
}

export const SAMPLER_PARAMETER_FIELDS: readonly SamplerParameterField[] = [
  {
    hint: 'Насколько модель уходит от самого вероятного продолжения',
    key: 'temperature',
    label: 'Temperature',
    step: 0.05,
    stepCeiling: 2,
  },
  {
    hint: 'Берёт только самые вероятные слова — до этой суммы вероятностей',
    key: 'topP',
    label: 'Top P',
    step: 0.01,
    stepCeiling: 1,
  },
  {
    hint: 'Не больше такого числа слов-кандидатов на каждом шаге',
    key: 'topK',
    label: 'Top K',
    step: 1,
    stepCeiling: 200,
  },
  {
    hint: 'Отбрасывает слова слабее этой доли от самого вероятного',
    key: 'minP',
    label: 'Min P',
    step: 0.01,
    stepCeiling: 1,
  },
  {
    hint: 'Насколько сильно наказывать за повтор уже сказанного',
    key: 'repeatPenalty',
    label: 'Repeat Penalty',
    step: 0.01,
    stepCeiling: 2,
  },
  {
    hint: 'Сколько последних токенов проверять на повторы',
    key: 'repeatPenaltyRange',
    label: 'Repeat Range',
    step: 32,
    stepCeiling: 8192,
  },
  {
    hint: 'Наказывать за возврат к уже упомянутым темам',
    key: 'presencePenalty',
    label: 'Presence Penalty',
    step: 0.05,
    stepCeiling: 2,
  },
  {
    hint: 'Предел длины одного ответа, в токенах',
    key: 'maxTokens',
    label: 'Max Length',
    step: 16,
    stepCeiling: 4096,
  },
  {
    hint: 'Сколько токенов истории уходит в модель',
    key: 'maxContextLength',
    label: 'Context',
    step: 512,
    stepCeiling: 32_768,
  },
];
