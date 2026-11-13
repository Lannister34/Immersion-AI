import { LorebookNotFoundError } from './get-lorebook.js';
import type { LorebookStore } from './lorebook-store.js';

export interface DeleteLorebookDependencies {
  readonly lorebookStore: Pick<LorebookStore, 'deleteLorebook'>;
}

export async function deleteLorebook(id: string, { lorebookStore }: DeleteLorebookDependencies): Promise<void> {
  const removed = await lorebookStore.deleteLorebook(id);
  if (!removed) {
    throw new LorebookNotFoundError(id);
  }
}
