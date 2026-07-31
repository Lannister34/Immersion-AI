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
  /** Одна строка по-русски: что параметр делает с ответом. */
  hint: string;
  /** Только целые значения. */
  integer: boolean;
  key: NumericSamplingKey;
  /** Человеческое имя; технические top_p и rep_pen в интерфейс не выносим. */
  label: string;
  /** Практичный потолок для кнопок шага; руками можно ввести и больше. */
  max: number;
  /** Нижняя граница контракта; null — ограничения нет. */
  min: number | null;
  step: number;
}

export const NUMERIC_SAMPLING_FIELDS: NumericSamplingField[] = [
  {
    hint: 'Насколько модель уходит от самого вероятного продолжения',
    integer: false,
    key: 'temperature',
    label: 'Temperature',
    max: 2,
    min: 0,
    step: 0.05,
  },
  {
    hint: 'Берёт только самые вероятные слова — до этой суммы вероятностей',
    integer: false,
    key: 'topP',
    label: 'Top P',
    max: 1,
    min: 0,
    step: 0.01,
  },
  {
    hint: 'Не больше такого числа слов-кандидатов на каждом шаге',
    integer: true,
    key: 'topK',
    label: 'Top K',
    max: 200,
    min: 0,
    step: 1,
  },
  {
    hint: 'Отбрасывает слова слабее этой доли от самого вероятного',
    integer: false,
    key: 'minP',
    label: 'Min P',
    max: 1,
    min: 0,
    step: 0.01,
  },
  {
    hint: 'Насколько сильно наказывать за повтор уже сказанного',
    integer: false,
    key: 'repeatPenalty',
    label: 'Repeat Penalty',
    max: 2,
    min: 0,
    step: 0.01,
  },
  {
    hint: 'Сколько последних токенов проверять на повторы',
    integer: true,
    key: 'repeatPenaltyRange',
    label: 'Repeat Range',
    max: 8192,
    min: 0,
    step: 32,
  },
  {
    hint: 'Наказывать за возврат к уже упомянутым темам',
    integer: false,
    key: 'presencePenalty',
    label: 'Presence Penalty',
    max: 2,
    min: null,
    step: 0.05,
  },
  {
    hint: 'Предел длины одного ответа, в токенах',
    integer: true,
    key: 'maxTokens',
    label: 'Max Length',
    max: 4096,
    min: 1,
    step: 16,
  },
  {
    hint: 'Сколько токенов истории уходит в модель',
    integer: true,
    key: 'maxContextLength',
    label: 'Context',
    max: 32_768,
    min: 1,
    step: 512,
  },
];

/** Стратегия обрезки живёт рядом с числовыми полями, но выбирается списком. */
export const CONTEXT_TRIM_FIELD = {
  hint: 'Что выбросить, когда история не влезает в окно',
  label: 'Обрезка контекста',
  options: [
    { label: 'обрезать середину', value: 'trim_middle' },
    { label: 'обрезать начало', value: 'trim_start' },
  ],
} as const;

export function describeContextTrimStrategy(value: string): string {
  return CONTEXT_TRIM_FIELD.options.find((option) => option.value === value)?.label ?? value;
}

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

function decimalsOf(step: number): number {
  return String(step).split('.')[1]?.length ?? 0;
}

/**
 * Шаг кнопкой «−»/«+»: считаем от действующего значения, а не от нуля, и
 * подтягиваем к практичному диапазону — но только в ту сторону, куда нажали.
 * Значение вне диапазона (например, окно контекста больше обычного) кнопка
 * не должна утаскивать обратно.
 */
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
  const lowerBound = field.min === null ? Number.NEGATIVE_INFINITY : Math.min(field.min, current);
  const next = direction > 0 ? Math.min(rounded, Math.max(field.max, current)) : Math.max(rounded, lowerBound);

  return String(next);
}

export interface SamplingFieldViewModel {
  error: string | undefined;
  field: NumericSamplingField;
  /** Значение из пресета — для подписи кнопки возврата. */
  inheritedText: string;
  isOverridden: boolean;
  /** То, что стоит в поле: своё значение чата либо унаследованное. */
  value: string;
}

function formatInherited(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

/**
 * Поле всегда показывает действующее значение: пока чат ничего не менял — из
 * пресета, дальше — своё. Отдельного «включить параметр» нет, правка сама
 * создаёт переопределение.
 */
export function toSamplingFieldViewModels(
  draft: SamplingOverridesDraft,
  errors: SamplingOverrideErrors,
  inherited: InheritedSampling | undefined,
): SamplingFieldViewModel[] {
  return NUMERIC_SAMPLING_FIELDS.map((field) => {
    const raw = draft[field.key];
    const isOverridden = raw.trim().length > 0;
    const inheritedText = formatInherited(inherited?.[field.key]);

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
