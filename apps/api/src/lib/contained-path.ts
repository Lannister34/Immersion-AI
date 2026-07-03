import path from 'node:path';

export class UnsafeRepositoryFileIdError extends Error {
  constructor(fileId: string) {
    super(`Unsafe repository file id: ${fileId}`);
    this.name = 'UnsafeRepositoryFileIdError';
  }
}

/**
 * Resolves `fileId` against `directory` and asserts the result is a direct child of that
 * directory. Guards file repositories against path traversal even if an unsafe id slips
 * past contract validation.
 */
export function resolveContainedFilePath(directory: string, fileId: string): string {
  const resolvedDirectory = path.resolve(directory);
  const resolvedPath = path.resolve(resolvedDirectory, fileId);
  const relativePath = path.relative(resolvedDirectory, resolvedPath);

  if (
    relativePath.length === 0 ||
    relativePath.startsWith('.') ||
    path.isAbsolute(relativePath) ||
    relativePath.includes(path.sep) ||
    relativePath.includes('/') ||
    // Windows drive-relative ids such as "C:evil.json" can resolve inside the
    // directory under a different name; the id must map to itself verbatim.
    path.basename(resolvedPath) !== fileId
  ) {
    throw new UnsafeRepositoryFileIdError(fileId);
  }

  return resolvedPath;
}
