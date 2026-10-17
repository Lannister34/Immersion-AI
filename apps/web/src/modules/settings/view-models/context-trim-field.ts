import type { SamplerPresetInput } from '@immersion/contracts/settings';

interface ContextTrimOption {
  label: string;
  value: SamplerPresetInput['contextTrimStrategy'];
}

interface ContextTrimField {
  hint: string;
  label: string;
  options: readonly ContextTrimOption[];
}

export const CONTEXT_TRIM_FIELD: ContextTrimField = {
  hint: 'Что выбросить, когда история не влезает в окно',
  label: 'Обрезка контекста',
  options: [
    { label: 'обрезать середину', value: 'trim_middle' },
    { label: 'обрезать начало', value: 'trim_start' },
  ],
};
