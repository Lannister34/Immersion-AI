import { deleteLorebookFile } from '../infrastructure/file-lorebook-repository.js';
import { LorebookNotFoundError } from './get-lorebook.js';

export async function deleteLorebook(id: string): Promise<void> {
  const removed = await deleteLorebookFile(id);
  if (!removed) {
    throw new LorebookNotFoundError(id);
  }
}
