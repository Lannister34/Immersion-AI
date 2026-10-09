import path from 'node:path';

export class UnsafeRepositoryFileIdError extends Error {
  constructor(fileId: string) {
    super(`Unsafe repository file id: ${fileId}`);
    this.name = 'UnsafeRepositoryFileIdError';
  }
}

const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:/u;

export function resolveContainedFilePath(directory: string, fileId: string): string {
  if (
    fileId.length === 0 ||
    fileId.startsWith('.') ||
    fileId.includes('/') ||
    fileId.includes('\\') ||
    WINDOWS_DRIVE_PREFIX.test(fileId)
  ) {
    throw new UnsafeRepositoryFileIdError(fileId);
  }

  const resolvedDirectory = path.resolve(directory);
  const resolvedPath = path.resolve(resolvedDirectory, fileId);

  if (path.relative(resolvedDirectory, resolvedPath) !== fileId) {
    throw new UnsafeRepositoryFileIdError(fileId);
  }

  return resolvedPath;
}
