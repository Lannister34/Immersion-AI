import type { LorebookDetailDto } from '@immersion/contracts/lorebooks';

import { readLorebookDetail } from '../infrastructure/file-lorebook-repository.js';

export class LorebookNotFoundError extends Error {
  constructor(lorebookId: string) {
    super(`Lorebook not found: ${lorebookId}`);
    this.name = 'LorebookNotFoundError';
  }
}

export async function getLorebook(id: string): Promise<LorebookDetailDto> {
  const detail = await readLorebookDetail(id);
  if (!detail) {
    throw new LorebookNotFoundError(id);
  }
  return detail;
}
