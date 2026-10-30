import { ContextTrimStrategySchema } from '@immersion/contracts/settings';
import { describe, expect, it } from 'vitest';

import { CONTEXT_TRIM_FIELD } from './context-trim-field';

describe('CONTEXT_TRIM_FIELD', () => {
  it('offers every trim strategy of the preset contract exactly once', () => {
    const offered = CONTEXT_TRIM_FIELD.options.map((option) => option.value);

    expect([...offered].sort()).toEqual([...ContextTrimStrategySchema.options].sort());
  });
});
