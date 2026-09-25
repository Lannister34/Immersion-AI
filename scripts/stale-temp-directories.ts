import { readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

export const CI_TEMP_DIRECTORY_PREFIX = 'immersion-ci-';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface TempDirectoryEntry {
  readonly name: string;
  readonly path: string;
  readonly modifiedMs: number;
}

export function selectStaleTempDirectories(
  entries: readonly TempDirectoryEntry[],
  nowMs: number,
  maxAgeMs: number = STALE_AFTER_MS,
): string[] {
  return entries
    .filter((entry) => isCiTempDirectoryName(entry.name) && nowMs - entry.modifiedMs > maxAgeMs)
    .map((entry) => entry.path);
}

export function removeStaleTempDirectories(root: string, nowMs: number): void {
  for (const directory of selectStaleTempDirectories(readCiTempDirectories(root), nowMs)) {
    console.log(`[ci-clean] Removing stale temporary checkout ${directory}`);
    removeTempDirectory(directory);
  }
}

export function removeTempDirectory(directory: string): void {
  try {
    rmSync(directory, { force: true, recursive: true, maxRetries: 3 });
  } catch (error) {
    console.warn(`[ci-clean] Could not remove ${directory}: ${String(error)}`);
  }
}

function isCiTempDirectoryName(name: string): boolean {
  return name.startsWith(CI_TEMP_DIRECTORY_PREFIX);
}

function readCiTempDirectories(root: string): TempDirectoryEntry[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((dirent) => {
    if (!dirent.isDirectory() || !isCiTempDirectoryName(dirent.name)) {
      return [];
    }

    const directoryPath = path.join(root, dirent.name);
    const stats = statSync(directoryPath, { throwIfNoEntry: false });

    return stats ? [{ name: dirent.name, path: directoryPath, modifiedMs: stats.mtimeMs }] : [];
  });
}
