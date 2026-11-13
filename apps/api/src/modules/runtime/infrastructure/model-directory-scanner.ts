import fs from 'node:fs/promises';
import path from 'node:path';

import type { RuntimeModelsDirStatus } from '@immersion/contracts/runtime';

import type { Clock } from '../../../platform/clock/clock.js';
import type { ModelScanner, RuntimeModelScanResult, ScannedModelSummary } from '../application/model-scanner.js';
import { pairVisionProjectors, type ScannedGgufFile } from '../domain/vision-projector-pairing.js';

const MODEL_SCAN_TTL_MS = 3_000;

export interface ModelDirectoryScannerOptions {
  readonly clock: Clock;
}

interface ModelScanCacheEntry {
  expiresAt: number;
  key: string;
  scan: RuntimeModelScanResult;
}

interface ScannedModelFile extends Omit<ScannedModelSummary, 'visionProjectorPath'>, ScannedGgufFile {}

async function readDirectoryEntries(directory: string) {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }
}

async function statFileSize(filePath: string) {
  try {
    return (await fs.stat(filePath)).size;
  } catch {
    return null;
  }
}

function toModelSummaries(files: ScannedModelFile[]): ScannedModelSummary[] {
  return pairVisionProjectors(files)
    .map(({ containingDirectory: _containingDirectory, ...model }): ScannedModelSummary => model)
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function scanModels(modelsDirs: readonly string[]): Promise<RuntimeModelScanResult> {
  const directories: RuntimeModelsDirStatus[] = [];
  const files: ScannedModelFile[] = [];
  const seenPaths = new Set<string>();

  for (const modelsDir of modelsDirs) {
    const entries = await readDirectoryEntries(modelsDir);
    directories.push({ path: modelsDir, exists: entries !== null });

    for (const entry of entries ?? []) {
      const entryPath = path.join(modelsDir, entry.name);

      if (entry.isFile() && entry.name.endsWith('.gguf') && !seenPaths.has(entryPath)) {
        const size = await statFileSize(entryPath);

        if (size === null) {
          continue;
        }

        seenPaths.add(entryPath);
        files.push({
          name: entry.name,
          path: entryPath,
          size,
          sourceDirectory: modelsDir,
          containingDirectory: modelsDir,
        });
      }

      if (!entry.isDirectory()) {
        continue;
      }

      const nestedEntries = await readDirectoryEntries(entryPath);

      for (const nestedEntry of nestedEntries ?? []) {
        if (!nestedEntry.isFile() || !nestedEntry.name.endsWith('.gguf')) {
          continue;
        }

        const nestedPath = path.join(entryPath, nestedEntry.name);
        if (seenPaths.has(nestedPath)) {
          continue;
        }

        const size = await statFileSize(nestedPath);

        if (size === null) {
          continue;
        }

        seenPaths.add(nestedPath);
        files.push({
          name: `${entry.name}/${nestedEntry.name}`,
          path: nestedPath,
          size,
          sourceDirectory: modelsDir,
          containingDirectory: entryPath,
        });
      }
    }
  }

  return { directories, models: toModelSummaries(files) };
}

export class ModelDirectoryScanner implements ModelScanner {
  private readonly clock: Clock;
  private cache: ModelScanCacheEntry | null = null;

  constructor({ clock }: ModelDirectoryScannerOptions) {
    this.clock = clock;
  }

  async scan(modelsDirs: readonly string[]): Promise<RuntimeModelScanResult> {
    const key = modelsDirs.join('|');
    const now = this.clock.now().getTime();

    if (this.cache && this.cache.key === key && this.cache.expiresAt > now) {
      return this.cache.scan;
    }

    const scan = await scanModels(modelsDirs);

    this.cache = {
      expiresAt: now + MODEL_SCAN_TTL_MS,
      key,
      scan,
    };

    return scan;
  }

  invalidate(): void {
    this.cache = null;
  }
}
