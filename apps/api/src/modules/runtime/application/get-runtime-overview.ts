import fs from 'node:fs/promises';
import path from 'node:path';

import {
  type RuntimeModelSummary,
  type RuntimeOverviewResponse,
  RuntimeOverviewResponseSchema,
} from '@immersion/contracts/runtime';

import { resolveDataRoot } from '../../../lib/data-root.js';
import { getEngineInfo, getState } from '../../../lib/llm-process.js';
import { readLegacyUserSettingsSource } from '../../../shared/infrastructure/legacy-settings-source.js';
import { normalizeRuntimeConfig } from './runtime-config.js';

const MODEL_SCAN_TTL_MS = 3_000;

interface ModelScanCacheEntry {
  expiresAt: number;
  key: string;
  models: RuntimeModelSummary[];
}

let modelScanCache: ModelScanCacheEntry | null = null;

export function invalidateRuntimeModelScanCache() {
  modelScanCache = null;
}

async function readDirectoryEntries(directory: string) {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function statFileSize(filePath: string) {
  try {
    return (await fs.stat(filePath)).size;
  } catch {
    return null;
  }
}

async function scanModels(modelsDirs: string[]): Promise<RuntimeModelSummary[]> {
  const models: RuntimeModelSummary[] = [];
  const seenPaths = new Set<string>();

  for (const modelsDir of modelsDirs) {
    const entries = await readDirectoryEntries(modelsDir);

    for (const entry of entries) {
      const entryPath = path.join(modelsDir, entry.name);

      if (entry.isFile() && entry.name.endsWith('.gguf') && !seenPaths.has(entryPath)) {
        const size = await statFileSize(entryPath);

        if (size === null) {
          continue;
        }

        seenPaths.add(entryPath);
        models.push({
          name: entry.name,
          path: entryPath,
          size,
          sourceDirectory: modelsDir,
        });
      }

      if (!entry.isDirectory()) {
        continue;
      }

      const nestedEntries = await readDirectoryEntries(entryPath);

      for (const nestedEntry of nestedEntries) {
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
        models.push({
          name: `${entry.name}/${nestedEntry.name}`,
          path: nestedPath,
          size,
          sourceDirectory: modelsDir,
        });
      }
    }
  }

  return models.sort((left, right) => left.name.localeCompare(right.name));
}

async function scanModelsCached(modelsDirs: string[]): Promise<RuntimeModelSummary[]> {
  const key = modelsDirs.join('|');
  const now = Date.now();

  if (modelScanCache && modelScanCache.key === key && modelScanCache.expiresAt > now) {
    return modelScanCache.models;
  }

  const models = await scanModels(modelsDirs);

  modelScanCache = {
    expiresAt: now + MODEL_SCAN_TTL_MS,
    key,
    models,
  };

  return models;
}

export async function getRuntimeOverview(): Promise<RuntimeOverviewResponse> {
  const source = readLegacyUserSettingsSource();
  const engine = getEngineInfo();
  const serverStatus = getState();
  const runtimeConfig = normalizeRuntimeConfig(source.llmServerConfig);
  const modelsDirs = runtimeConfig.modelsDirs.map((directory) => {
    if (path.isAbsolute(directory)) {
      return directory;
    }

    return path.resolve(resolveDataRoot(), directory);
  });

  return RuntimeOverviewResponseSchema.parse({
    engine,
    serverStatus,
    serverConfig: {
      ...runtimeConfig,
      modelsDirs,
    },
    models: await scanModelsCached(modelsDirs),
  });
}
