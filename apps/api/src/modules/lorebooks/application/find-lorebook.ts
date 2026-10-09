import type { LorebookDetailDto } from '@immersion/contracts/lorebooks';

import { readLorebookDetail } from '../infrastructure/file-lorebook-repository.js';

export async function findLorebook(id: string): Promise<LorebookDetailDto | null> {
  return readLorebookDetail(id);
}
