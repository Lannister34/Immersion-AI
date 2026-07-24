import { type ChatSamplingOverridesDto, ChatSamplingOverridesDtoSchema } from '@immersion/contracts/chats';
import type { ChatReplyPromptPreviewResponse } from '@immersion/contracts/generation';

/** Значения, которые действуют, пока чат ничего не переопределяет. */
export type InheritedSampling = ChatReplyPromptPreviewResponse['effectiveSettings']['sampling'];

export type SamplingOverrideKey = keyof ChatSamplingOverridesDto;
export type NumericSamplingKey = Exclude<SamplingOverrideKey, 'contextTrimStrategy'>;

/** Черновик держим строками: пустая строка — «наследовать», а не 0. */
export type SamplingOverridesDraft = Record<SamplingOverrideKey, string>;

export type SamplingOverrideErrors = Partial<Record<SamplingOverrideKey, string>>;

export interface NumericSamplingField {
  /** Только целые значения. */
  integer: boolean;
  key: NumericSamplingKey;
  /** Технические имена совпадают с карточкой пресета в настройках. */
  label: string;
  min: number | null;
  step: number;
}

export const NUMERIC_SAMPLING_FIELDS: NumericSamplingField[] = [
  { integer: false, key: 'temperature', label: 'temperature', min: 0, step: 0.05 },
  { integer: false, key: 'topP', label: 'top_p', min: 0, step: 0.01 },
  { integer: true, key: 'topK', label: 'top_k', min: 0, step: 1 },
  { integer: false, key: 'minP', label: 'min_p', min: 0, step: 0.01 },
  { integer: false, key: 'repeatPenalty', label: 'rep_pen', min: 0, step: 0.01 },
  { integer: true, key: 'repeatPenaltyRange', label: 'rep_pen_range', min: 0, step: 32 },
  { integer: false, key: 'presencePenalty', label: 'presence_penalty', min: null, step: 0.05 },
  { integer: true, key: 'maxTokens', label: 'max_length', min: 1, step: 16 },
  { integer: true, key: 'maxContextLength', label: 'context', min: 1, step: 512 },
];

export const SAMPLING_OVERRIDE_KEYS: SamplingOverrideKey[] = [
  'contextTrimStrategy',
  ...NUMERIC_SAMPLING_FIELDS.map((field) => field.key),
];

export function toSamplingDraft(overrides: ChatSamplingOverridesDto): SamplingOverridesDraft {
  const draft = { contextTrimStrategy: overrides.contextTrimStrategy ?? '' } as SamplingOverridesDraft;

  for (const field of NUMERIC_SAMPLING_FIELDS) {
    const value = overrides[field.key];
    draft[field.key] = value === null ? '' : String(value);
  }

  return draft;
}

export function createEmptySamplingDraft(): SamplingOverridesDraft {
  const draft = { contextTrimStrategy: '' } as SamplingOverridesDraft;

  for (const field of NUMERIC_SAMPLING_FIELDS) {
    draft[field.key] = '';
  }

  return draft;
}

export function samplingDraftsEqual(left: SamplingOverridesDraft, right: SamplingOverridesDraft): boolean {
  return SAMPLING_OVERRIDE_KEYS.every((key) => left[key].trim() === right[key].trim());
}

export function countSamplingOverrides(draft: SamplingOverridesDraft): number {
  return SAMPLING_OVERRIDE_KEYS.filter((key) => draft[key].trim().length > 0).length;
}

export interface SamplingDraftParseResult {
  errors: SamplingOverrideErrors;
  /** null, когда хотя бы одно поле не прошло проверку. */
  overrides: ChatSamplingOverridesDto | null;
}

function describeRangeError(min: number): string {
  return min > 0 ? `Минимум ${min}` : 'Не может быть отрицательным';
}

/** Разбирает черновик в DTO: пустые поля становятся null («наследовать»). */
export function parseSamplingDraft(draft: SamplingOverridesDraft): SamplingDraftParseResult {
  const errors: SamplingOverrideErrors = {};
  const candidate: Record<string, unknown> = {
    contextTrimStrategy: draft.contextTrimStrategy.length > 0 ? draft.contextTrimStrategy : null,
  };

  for (const field of NUMERIC_SAMPLING_FIELDS) {
    // Запятая как десятичный разделитель — привычный ввод в русской раскладке.
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

    if (field.min !== null && value < field.min) {
      errors[field.key] = describeRangeError(field.min);
      continue;
    }

    candidate[field.key] = value;
  }

  if (Object.keys(errors).length > 0) {
    return { errors, overrides: null };
  }

  const parsed = ChatSamplingOverridesDtoSchema.safeParse(candidate);

  if (!parsed.success) {
    // Контракт — последний рубеж: сюда попадают только неучтённые ограничения.
    const failedKey = parsed.error.issues[0]?.path[0];

    return {
      errors: typeof failedKey === 'string' ? { [failedKey as SamplingOverrideKey]: 'Недопустимое значение' } : {},
      overrides: null,
    };
  }

  return { errors: {}, overrides: parsed.data };
}
