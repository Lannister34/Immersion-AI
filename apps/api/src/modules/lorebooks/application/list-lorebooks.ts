import { type LorebookListResponse, LorebookListResponseSchema } from '@immersion/contracts/lorebooks';

import type { LorebookStore } from './lorebook-store.js';

export interface ListLorebooksDependencies {
  readonly lorebookStore: Pick<LorebookStore, 'listLorebooks'>;
}

export async function listLorebooks({ lorebookStore }: ListLorebooksDependencies): Promise<LorebookListResponse> {
  const items = await lorebookStore.listLorebooks();
  return LorebookListResponseSchema.parse({ items });
}
