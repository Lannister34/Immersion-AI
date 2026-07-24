import type { ChatSamplingOverridesDto } from '@immersion/contracts/chats';
import { describe, expect, it } from 'vitest';

import {
  countSamplingOverrides,
  createEmptySamplingDraft,
  parseSamplingDraft,
  samplingDraftsEqual,
  toSamplingDraft,
} from './sampling-overrides';

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
