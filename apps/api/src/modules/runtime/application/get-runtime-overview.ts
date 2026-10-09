import fs from 'node:fs/promises';
import path from 'node:path';

import {
  type RuntimeModelSummary,
  type RuntimeModelsDirStatus,
  type RuntimeOverviewResponse,
  RuntimeOverviewResponseSchema,
} from '@immersion/contracts/runtime';

import { resolveDataRoot } from '../../../lib/data-root.js';
import { getLlmServerRuntimeConfig } from '../../settings/application/get-llm-server-runtime-config.js';
import { pairVisionProjectors, type ScannedGgufFile } from '../domain/vision-projector-pairing.js';
import { getLlmProcessManager } from '../infrastructure/llm-process-manager.js';
import { normalizeRuntimeConfig } from './runtime-config.js';

const MODEL_SCAN_TTL_MS = 3_000;

interface RuntimeModelScanResult {
  directories: RuntimeModelsDirStatus[];
  models: RuntimeModelSummary[];
}

interface ModelScanCacheEntry {
  expiresAt: number;
  key: string;
  scan: RuntimeModelScanResult;
}

let modelScanCache: ModelScanCacheEntry | null = null;

export function invalidateRuntimeModelScanCache() {
  modelScanCache = null;
}

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

interface ScannedModelFile extends Omit<RuntimeModelSummary, 'visionProjectorPath'>, ScannedGgufFile {}

function toModelSummaries(files: ScannedModelFile[]): RuntimeModelSummary[] {
  return pairVisionProjectors(files)
    .map(({ containingDirectory: _containingDirectory, ...model }): RuntimeModelSummary => model)
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function scanModels(modelsDirs: string[]): Promise<RuntimeModelScanResult> {
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

async function scanModelsCached(modelsDirs: string[]): Promise<RuntimeModelScanResult> {
  const key = modelsDirs.join('|');
  const now = Date.now();

  if (modelScanCache && modelScanCache.key === key && modelScanCache.expiresAt > now) {
    return modelScanCache.scan;
  }

  const scan = await scanModels(modelsDirs);

  modelScanCache = {
    expiresAt: now + MODEL_SCAN_TTL_MS,
    key,
    scan,
  };

  return scan;
}

export async function getRuntimeOverview(): Promise<RuntimeOverviewResponse> {
  const manager = getLlmProcessManager();
  const engine = manager.getEngineInfo();
  const serverStatus = manager.getState();
  const runtimeConfig = normalizeRuntimeConfig(getLlmServerRuntimeConfig());
  const modelsDirs = runtimeConfig.modelsDirs.map((directory) => {
    if (path.isAbsolute(directory)) {
      return directory;
    }

    return path.resolve(resolveDataRoot(), directory);
  });

  const scan = await scanModelsCached(modelsDirs);

  return RuntimeOverviewResponseSchema.parse({
    engine,
    serverStatus,
    serverConfig: {
      ...runtimeConfig,
      modelsDirs,
    },
    models: scan.models,
    modelsDirsStatus: scan.directories,
  });
}
