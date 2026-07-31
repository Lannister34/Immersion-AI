import type { LorebookDetailDto, LorebookEntryDto } from '@immersion/contracts/lorebooks';

import {
  createLorebookFile,
  readLorebookDetail,
  writeLorebookFile,
} from '../infrastructure/file-lorebook-repository.js';
import { LorebookNotFoundError } from './get-lorebook.js';

export interface SaveLorebookInput {
  entries: LorebookEntryDto[];
  name: string;
  tags: string[];
}

export async function updateLorebook(id: string, input: SaveLorebookInput): Promise<LorebookDetailDto> {
  const existing = await readLorebookDetail(id);
  if (!existing) {
    throw new LorebookNotFoundError(id);
  }
  return writeLorebookFile(id, input);
}

export async function createLorebook(input: SaveLorebookInput): Promise<LorebookDetailDto> {
  return createLorebookFile(input);
}
