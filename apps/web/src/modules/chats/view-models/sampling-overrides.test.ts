import type { ChatSamplingOverridesDto } from '@immersion/contracts/chats';
import { describe, expect, it } from 'vitest';

import {
  countSamplingOverrides,
  createEmptySamplingDraft,
  type InheritedSampling,
  NUMERIC_SAMPLING_FIELDS,
  parseSamplingDraft,
  samplingDraftsEqual,
  stepSamplingValue,
  toSamplingDraft,
  toSamplingFieldViewModels,
} from './sampling-overrides';

const PRESET: InheritedSampling = {
  contextTrimStrategy: 'trim_middle',
  maxContextLength: 8192,
  maxTokens: 512,
  minP: 0.05,
  presencePenalty: 0,
  repeatPenalty: 1.1,
  repeatPenaltyRange: 2048,
  temperature: 0.8,
  topK: 40,
  topP: 0.95,
};

const EMPTY_OVERRIDES: ChatSamplingOverridesDto = {
  contextTrimStrategy: null,
  maxContextLength: null,
  maxTokens: null,
  minP: null,
  presencePenalty: null,
  repeatPenalty: null,
  repeatPenaltyRange: null,
  temperature: null,
  topK: null,
  topP: null,
};

describe('toSamplingDraft', () => {
  it('renders missing overrides as empty strings', () => {
    expect(toSamplingDraft(EMPTY_OVERRIDES)).toEqual(createEmptySamplingDraft());
  });

  it('keeps existing overrides as editable text', () => {
    const draft = toSamplingDraft({
      ...EMPTY_OVERRIDES,
      contextTrimStrategy: 'trim_start',
      temperature: 0.7,
      topK: 40,
    });

    expect(draft.temperature).toBe('0.7');
    expect(draft.topK).toBe('40');
    expect(draft.contextTrimStrategy).toBe('trim_start');
    expect(draft.minP).toBe('');
  });
});

describe('toSamplingFieldViewModels', () => {
  function findRow(rows: ReturnType<typeof toSamplingFieldViewModels>, key: string) {
    const row = rows.find((candidate) => candidate.field.key === key);
    if (!row) {
      throw new Error(`Field is missing from the view model: ${key}`);
    }
    return row;
  }

  it('shows the preset value while the chat has no override of its own', () => {
    const rows = toSamplingFieldViewModels(createEmptySamplingDraft(), {}, PRESET);
    const temperature = findRow(rows, 'temperature');

    expect(temperature.isOverridden).toBe(false);
    expect(temperature.value).toBe('0.8');
    expect(temperature.inheritedText).toBe('0.8');
  });

  it('keeps the preset value visible for the undo hint after an override', () => {
    const rows = toSamplingFieldViewModels({ ...createEmptySamplingDraft(), temperature: '1.15' }, {}, PRESET);
    const temperature = findRow(rows, 'temperature');

    expect(temperature.isOverridden).toBe(true);
    expect(temperature.value).toBe('1.15');
    expect(temperature.inheritedText).toBe('0.8');
  });

  it('leaves the field empty when there is nothing to inherit yet', () => {
    const rows = toSamplingFieldViewModels(createEmptySamplingDraft(), {}, undefined);

    expect(findRow(rows, 'topK').value).toBe('');
  });

  it('carries the field error next to its own row', () => {
    const rows = toSamplingFieldViewModels(
      { ...createEmptySamplingDraft(), topK: '12.5' },
      { topK: 'Только целое число' },
      PRESET,
    );

    expect(findRow(rows, 'topK').error).toBe('Только целое число');
    expect(findRow(rows, 'topP').error).toBeUndefined();
  });
});

describe('stepSamplingValue', () => {
  const temperature = NUMERIC_SAMPLING_FIELDS.find((field) => field.key === 'temperature');
  const context = NUMERIC_SAMPLING_FIELDS.find((field) => field.key === 'maxContextLength');

  if (!temperature || !context) {
    throw new Error('Sampling fields are missing from the view model.');
  }

  it('steps from the value shown in the field', () => {
    expect(stepSamplingValue(temperature, '0.7', 1, 0.8)).toBe('0.75');
    expect(stepSamplingValue(temperature, '0.7', -1, 0.8)).toBe('0.65');
  });

  it('starts from the inherited value when the field is empty', () => {
    expect(stepSamplingValue(temperature, '', 1, 0.8)).toBe('0.85');
  });

  it('keeps the decimals of the step instead of float noise', () => {
    expect(stepSamplingValue(temperature, '1.15', 1, undefined)).toBe('1.2');
  });

  it('accepts a comma as the decimal separator', () => {
    expect(stepSamplingValue(temperature, '0,7', 1, undefined)).toBe('0.75');
  });

  it('stops at the field bounds', () => {
    expect(stepSamplingValue(temperature, '0', -1, undefined)).toBe('0');
    expect(stepSamplingValue(temperature, '2', 1, undefined)).toBe('2');
  });

  it('does not drag a value that is already above the practical range', () => {
    expect(stepSamplingValue(context, '65536', 1, undefined)).toBe('65536');
    expect(stepSamplingValue(context, '65536', -1, undefined)).toBe('65024');
  });
});

describe('parseSamplingDraft', () => {
  it('turns empty fields into inherited nulls', () => {
    expect(parseSamplingDraft(createEmptySamplingDraft())).toEqual({ errors: {}, overrides: EMPTY_OVERRIDES });
  });

  it('accepts a comma as the decimal separator', () => {
    const result = parseSamplingDraft({ ...createEmptySamplingDraft(), temperature: '0,85' });

    expect(result.overrides?.temperature).toBe(0.85);
  });

  it('rejects a fractional value for an integer field', () => {
    const result = parseSamplingDraft({ ...createEmptySamplingDraft(), topK: '12.5' });

    expect(result.overrides).toBeNull();
    expect(result.errors.topK).toBe('Только целое число');
  });

  it('rejects values below the field minimum', () => {
    const negative = parseSamplingDraft({ ...createEmptySamplingDraft(), temperature: '-1' });
    const zeroLength = parseSamplingDraft({ ...createEmptySamplingDraft(), maxTokens: '0' });

    expect(negative.errors.temperature).toBe('Не может быть отрицательным');
    expect(zeroLength.errors.maxTokens).toBe('Минимум 1');
  });

  it('rejects text that is not a number', () => {
    const result = parseSamplingDraft({ ...createEmptySamplingDraft(), topP: 'много' });

    expect(result.errors.topP).toBe('Введите число');
  });

  it('allows a negative presence penalty', () => {
    const result = parseSamplingDraft({ ...createEmptySamplingDraft(), presencePenalty: '-0.2' });

    expect(result.overrides?.presencePenalty).toBe(-0.2);
  });
});

describe('samplingDraftsEqual', () => {
  it('ignores surrounding whitespace', () => {
    const left = { ...createEmptySamplingDraft(), temperature: '0.7' };
    const right = { ...createEmptySamplingDraft(), temperature: ' 0.7 ' };

    expect(samplingDraftsEqual(left, right)).toBe(true);
  });

  it('detects a changed field', () => {
    const left = { ...createEmptySamplingDraft(), temperature: '0.7' };
    const right = { ...createEmptySamplingDraft(), temperature: '0.8' };

    expect(samplingDraftsEqual(left, right)).toBe(false);
  });
});

describe('countSamplingOverrides', () => {
  it('counts only filled fields', () => {
    const draft = { ...createEmptySamplingDraft(), contextTrimStrategy: 'trim_start', temperature: '0.7', topK: '  ' };

    expect(countSamplingOverrides(draft)).toBe(2);
  });
});
