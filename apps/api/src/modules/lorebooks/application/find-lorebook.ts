import type { LorebookDetailDto } from '@immersion/contracts/lorebooks';

import { readLorebookDetail } from '../infrastructure/file-lorebook-repository.js';

/**
 * Tolerant public read: returns null when the lorebook is absent.
 * Prefer this over getLorebook for cross-module consumers that treat
 * a missing lorebook as a normal state, not an error.
 */
export async function findLorebook(id: string): Promise<LorebookDetailDto | null> {
  return readLorebookDetail(id);
}
