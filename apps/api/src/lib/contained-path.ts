import path from 'node:path';

export class UnsafeRepositoryFileIdError extends Error {
  constructor(fileId: string) {
    super(`Unsafe repository file id: ${fileId}`);
    this.name = 'UnsafeRepositoryFileIdError';
  }
}

const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:/u;

/**
 * Resolves `fileId` against `directory` and asserts the result is a direct child of that
 * directory. Guards file repositories against path traversal even if an unsafe id slips
 * past contract validation.
 *
 * Проверки на разделители и диск сделаны строками, а не через `node:path`: на Linux
 * «nested\inner.json» и «C:evil.json» — обычные имена файлов, и платформенная проверка
 * пропускала бы идентификаторы, опасные на Windows. Данные переносимы между системами,
 * поэтому «простое имя файла» должно значить одно и то же везде.
 */
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

  // Имя должно отображаться в себя: Windows молча срезает хвостовые точки и пробелы,
  // и «evil.json.» указывал бы на другой файл.
  if (path.relative(resolvedDirectory, resolvedPath) !== fileId) {
    throw new UnsafeRepositoryFileIdError(fileId);
  }

  return resolvedPath;
}
