import { type LorebookListResponse, LorebookListResponseSchema } from '@immersion/contracts/lorebooks';

import { listLorebookFiles } from '../infrastructure/file-lorebook-repository.js';

export async function listLorebooks(): Promise<LorebookListResponse> {
  const items = await listLorebookFiles();
  return LorebookListResponseSchema.parse({ items });
}
