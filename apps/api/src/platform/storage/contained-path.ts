import path from 'node:path';

import { isPlainFileName } from '@immersion/contracts/common';

export class UnsafeRepositoryFileIdError extends Error {
  constructor(fileId: string) {
    super(`Unsafe repository file id: ${fileId}`);
    this.name = 'UnsafeRepositoryFileIdError';
  }
}

export function resolveContainedFilePath(directory: string, fileId: string): string {
  if (!isPlainFileName(fileId)) {
    throw new UnsafeRepositoryFileIdError(fileId);
  }

  return path.join(path.resolve(directory), fileId);
}
