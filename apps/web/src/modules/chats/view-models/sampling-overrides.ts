import { type ChatSamplingOverridesDto, ChatSamplingOverridesDtoSchema } from '@immersion/contracts/chats';
import type { ChatReplyPromptPreviewResponse } from '@immersion/contracts/generation';

import { numberLimitsOf } from '../../../shared/lib/schema-limits';
import { CONTEXT_TRIM_FIELD, SAMPLER_PARAMETER_FIELDS, type SamplerParameterField } from '../../settings';

export type InheritedSampling = ChatReplyPromptPreviewResponse['effectiveSettings']['sampling'];

export type SamplingOverrideKey = keyof ChatSamplingOverridesDto;

export type SamplingOverridesDraft = Record<SamplingOverrideKey, string>;

export type SamplingOverrideErrors = Partial<Record<SamplingOverrideKey, string>>;

export interface NumericSamplingField extends SamplerParameterField {
  contractMinimum: number | null;
  integer: boolean;
}

export const NUMERIC_SAMPLING_FIELDS: readonly NumericSamplingField[] = SAMPLER_PARAMETER_FIELDS.map((field) => {
  const limits = numberLimitsOf(ChatSamplingOverridesDtoSchema.shape[field.key]);

  return { ...field, contractMinimum: limits.minimum, integer: limits.integer };
});

export function describeContextTrimStrategy(value: string): string {
  return CONTEXT_TRIM_FIELD.options.find((option) => option.value === value)?.label ?? value;
}

export const SAMPLING_OVERRIDE_KEYS: SamplingOverrideKey[] = [
  'contextTrimStrategy',
  ...NUMERIC_SAMPLING_FIELDS.map((field) => field.key),
];

function toFieldText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export function toSamplingDraft(overrides: ChatSamplingOverridesDto): SamplingOverridesDraft {
  return {
    contextTrimStrategy: overrides.contextTrimStrategy ?? '',
    maxContextLength: toFieldText(overrides.maxContextLength),
    maxTokens: toFieldText(overrides.maxTokens),
    minP: toFieldText(overrides.minP),
    presencePenalty: toFieldText(overrides.presencePenalty),
    repeatPenalty: toFieldText(overrides.repeatPenalty),
    repeatPenaltyRange: toFieldText(overrides.repeatPenaltyRange),
    temperature: toFieldText(overrides.temperature),
    topK: toFieldText(overrides.topK),
    topP: toFieldText(overrides.topP),
  };
}

export function createEmptySamplingDraft(): SamplingOverridesDraft {
  return {
    contextTrimStrategy: '',
    maxContextLength: '',
    maxTokens: '',
    minP: '',
    presencePenalty: '',
    repeatPenalty: '',
    repeatPenaltyRange: '',
    temperature: '',
    topK: '',
    topP: '',
  };
}

export function samplingDraftsEqual(left: SamplingOverridesDraft, right: SamplingOverridesDraft): boolean {
  return SAMPLING_OVERRIDE_KEYS.every((key) => left[key].trim() === right[key].trim());
}

export function countSamplingOverrides(draft: SamplingOverridesDraft): number {
  return SAMPLING_OVERRIDE_KEYS.filter((key) => draft[key].trim().length > 0).length;
}

function decimalsOf(step: number): number {
  return String(step).split('.')[1]?.length ?? 0;
}

export function stepSamplingValue(
  field: NumericSamplingField,
  currentText: string,
  direction: 1 | -1,
  inherited: number | undefined,
): string {
  const parsed = Number(currentText.trim().replace(',', '.'));
  const current = Number.isFinite(parsed) && currentText.trim().length > 0 ? parsed : (inherited ?? 0);
  const raw = current + direction * field.step;
  const rounded = Number(raw.toFixed(decimalsOf(field.step)));
  const lowerBound =
    field.contractMinimum === null ? Number.NEGATIVE_INFINITY : Math.min(field.contractMinimum, current);
  const next = direction > 0 ? Math.min(rounded, Math.max(field.stepCeiling, current)) : Math.max(rounded, lowerBound);

  return String(next);
}

export interface SamplingFieldViewModel {
  error: string | undefined;
  field: NumericSamplingField;
  inheritedText: string;
  isOverridden: boolean;
  value: string;
}

export function toSamplingFieldViewModels(
  draft: SamplingOverridesDraft,
  errors: SamplingOverrideErrors,
  inherited: InheritedSampling | undefined,
): SamplingFieldViewModel[] {
  return NUMERIC_SAMPLING_FIELDS.map((field) => {
    const raw = draft[field.key];
    const isOverridden = raw.trim().length > 0;
    const inheritedText = toFieldText(inherited?.[field.key]);

    return {
      error: errors[field.key],
      field,
      inheritedText,
      isOverridden,
      value: isOverridden ? raw : inheritedText,
    };
  });
}

export interface SamplingDraftParseResult {
  errors: SamplingOverrideErrors;
  overrides: ChatSamplingOverridesDto | null;
}

function describeRangeError(min: number): string {
  return min === 0 ? 'Не может быть отрицательным' : `Минимум ${min}`;
}

export function parseSamplingDraft(draft: SamplingOverridesDraft): SamplingDraftParseResult {
  const errors: SamplingOverrideErrors = {};
  const candidate: Record<string, unknown> = {
    contextTrimStrategy: draft.contextTrimStrategy.length > 0 ? draft.contextTrimStrategy : null,
  };

  for (const field of NUMERIC_SAMPLING_FIELDS) {
    const raw = draft[field.key].trim().replace(',', '.');

    if (raw.length === 0) {
      candidate[field.key] = null;
      continue;
    }

    const value = Number(raw);

    if (!Number.isFinite(value)) {
      errors[field.key] = 'Введите число';
      continue;
    }

    if (field.integer && !Number.isInteger(value)) {
      errors[field.key] = 'Только целое число';
      continue;
    }

    if (field.contractMinimum !== null && value < field.contractMinimum) {
      errors[field.key] = describeRangeError(field.contractMinimum);
      continue;
    }

    candidate[field.key] = value;
  }

  if (Object.keys(errors).length > 0) {
    return { errors, overrides: null };
  }

  const parsed = ChatSamplingOverridesDtoSchema.safeParse(candidate);

  if (!parsed.success) {
    const failedKey = ChatSamplingOverridesDtoSchema.keyof().safeParse(parsed.error.issues[0]?.path[0]);

    return {
      errors: failedKey.success ? { [failedKey.data]: 'Недопустимое значение' } : {},
      overrides: null,
    };
  }

  return { errors: {}, overrides: parsed.data };
}
