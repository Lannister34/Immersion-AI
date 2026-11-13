import type { LorebookDetailDto } from '@immersion/contracts/lorebooks';

import type { LorebookStore } from './lorebook-store.js';

export class LorebookNotFoundError extends Error {
  constructor(lorebookId: string) {
    super(`Lorebook not found: ${lorebookId}`);
    this.name = 'LorebookNotFoundError';
  }
}

export interface GetLorebookDependencies {
  readonly lorebookStore: Pick<LorebookStore, 'readLorebookDetail'>;
}

export async function getLorebook(id: string, { lorebookStore }: GetLorebookDependencies): Promise<LorebookDetailDto> {
  const detail = await lorebookStore.readLorebookDetail(id);
  if (!detail) {
    throw new LorebookNotFoundError(id);
  }
  return detail;
}
