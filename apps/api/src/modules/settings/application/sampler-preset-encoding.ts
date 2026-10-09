import { randomUUID } from 'node:crypto';

import type { SamplerPresetInput, SamplerPresetSummarySchema } from '@immersion/contracts/settings';
import type { z } from 'zod';

export type SamplerPresetSummary = z.infer<typeof SamplerPresetSummarySchema>;

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

const COMBINING_DIACRITICS = /[\u0300-\u036f]/gu;

function slugifyName(name: string): string {
  const ascii = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/[^\da-z]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return ascii.length > 0 ? ascii.slice(0, 48) : '';
}

export function generateUniquePresetId(name: string, existingIds: ReadonlySet<string>): string {
  const base = slugifyName(name);
  if (base && !existingIds.has(base)) {
    return base;
  }

  if (base) {
    for (let suffix = 2; suffix < 1000; suffix += 1) {
      const candidate = `${base}-${suffix}`;
      if (!existingIds.has(candidate)) {
        return candidate;
      }
    }
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `preset-${randomUUID().slice(0, 8)}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }

  throw new Error('Failed to generate a unique sampler preset id.');
}
