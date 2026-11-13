import type { LorebookDetailDto } from '@immersion/contracts/lorebooks';
import { describe, expect, it, vi } from 'vitest';

import { createManualClock } from '../../../test-support/manual-clock.js';
import { LorebookNotFoundError } from './get-lorebook.js';
import type { LorebookFields, LorebookStore } from './lorebook-store.js';
import { createLorebook, updateLorebook } from './save-lorebook.js';

const FIELDS: LorebookFields = {
  entries: [{ content: 'Город у моря.', enabled: true, keys: ['Порт'], priority: 0 }],
  name: 'Мир',
  tags: [],
};

function storeWith(stored: LorebookDetailDto | null) {
  return {
    createLorebook: vi.fn<LorebookStore['createLorebook']>((fields, savedAt) =>
      Promise.resolve({ ...fields, createdAt: savedAt, id: 'Мир.json', updatedAt: savedAt }),
    ),
    readLorebookDetail: vi.fn<LorebookStore['readLorebookDetail']>(() => Promise.resolve(stored)),
    writeLorebook: vi.fn<LorebookStore['writeLorebook']>(),
  };
}

describe('save lorebook', () => {
  it('rejects an update of a missing lorebook', async () => {
    const lorebookStore = storeWith(null);

    await expect(
      updateLorebook('Нет такого.json', FIELDS, { clock: createManualClock(), lorebookStore }),
    ).rejects.toBeInstanceOf(LorebookNotFoundError);
    expect(lorebookStore.writeLorebook).not.toHaveBeenCalled();
  });

  it('stamps a new lorebook with the clock it was given', async () => {
    const clock = createManualClock({ start: new Date('2026-11-13T09:00:00.000Z') });

    const created = await createLorebook(FIELDS, { clock, lorebookStore: storeWith(null) });

    expect(created.updatedAt).toBe('2026-11-13T09:00:00.000Z');
  });
});
