import type { StoredSamplerPresetFixture } from './stored-user-settings-fixture-schema.js';

export type StoredSamplingFixture = Partial<Omit<StoredSamplerPresetFixture, 'id' | 'name'>>;

export function storedSamplerPreset(
  id: string,
  name: string,
  sampling: StoredSamplingFixture = {},
): StoredSamplerPresetFixture {
  return {
    id,
    name,
    temperature: 1,
    top_p: 1,
    top_k: 0,
    min_p: 0.02,
    rep_pen: 1.05,
    rep_pen_range: 2048,
    presence_penalty: 0,
    max_length: 600,
    max_context_length: 8192,
    context_trim_strategy: 'trim_middle',
    ...sampling,
  };
}
