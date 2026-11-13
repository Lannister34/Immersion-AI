import type { LorebookDetailDto } from '@immersion/contracts/lorebooks';

import type { Clock } from '../../../platform/clock/clock.js';
import { LorebookNotFoundError } from './get-lorebook.js';
import type { LorebookFields, LorebookStore } from './lorebook-store.js';

export interface SaveLorebookDependencies {
  readonly clock: Clock;
  readonly lorebookStore: Pick<LorebookStore, 'createLorebook' | 'readLorebookDetail' | 'writeLorebook'>;
}

export async function updateLorebook(
  id: string,
  fields: LorebookFields,
  { clock, lorebookStore }: SaveLorebookDependencies,
): Promise<LorebookDetailDto> {
  const existing = await lorebookStore.readLorebookDetail(id);
  if (!existing) {
    throw new LorebookNotFoundError(id);
  }
  return lorebookStore.writeLorebook(id, fields, clock.now().toISOString());
}

export async function createLorebook(
  fields: LorebookFields,
  { clock, lorebookStore }: SaveLorebookDependencies,
): Promise<LorebookDetailDto> {
  return lorebookStore.createLorebook(fields, clock.now().toISOString());
}
