import fs from 'node:fs';
import path from 'node:path';

import { isSmokeDataRoot } from './smoke-data-root-name.js';

interface StaleSmokeDataRootsQuery {
  parent: string;
  now: number;
  maxAgeMs: number;
}

interface SmokeDataRootPruneFailure {
  directory: string;
  error: unknown;
}

export interface SmokeDataRootPruneResult {
  removed: string[];
  failed: SmokeDataRootPruneFailure[];
}

function readEntries(parent: string, failed: SmokeDataRootPruneFailure[]): fs.Dirent[] {
  try {
    return fs.readdirSync(parent, { withFileTypes: true });
  } catch (error) {
    failed.push({ directory: parent, error });

    return [];
  }
}

export function pruneStaleSmokeDataRoots({
  parent,
  now,
  maxAgeMs,
}: StaleSmokeDataRootsQuery): SmokeDataRootPruneResult {
  const removed: string[] = [];
  const failed: SmokeDataRootPruneFailure[] = [];

  for (const entry of readEntries(parent, failed)) {
    const candidate = path.join(parent, entry.name);
    if (!entry.isDirectory() || !isSmokeDataRoot(parent, candidate)) {
      continue;
    }

    try {
      const stats = fs.lstatSync(candidate, { throwIfNoEntry: false });
      if (!stats || now - stats.mtimeMs <= maxAgeMs) {
        continue;
      }

      fs.rmSync(candidate, { force: true, maxRetries: 3, recursive: true });
      removed.push(candidate);
    } catch (error) {
      failed.push({ directory: candidate, error });
    }
  }

  return { failed, removed };
}
