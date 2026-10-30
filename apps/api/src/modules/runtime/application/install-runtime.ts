import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

import type { RuntimeInstallCommand, RuntimeOverviewResponse } from '@immersion/contracts/runtime';

import { getSharedApiLogger } from '../../../platform/logging/shared-api-logger.js';
import { getPrimaryRuntimeRoot } from '../infrastructure/llm-process-manager.js';
import { getRuntimeOverview } from './get-runtime-overview.js';
import { type GitHubRelease, type GitHubReleaseAsset, GitHubReleaseListSchema } from './github-release-schema.js';
import { readAssetSha256 } from './read-asset-sha256.js';
import { RuntimeInstallError } from './runtime-errors.js';
import { type RuntimeInstallPlan, selectRuntimeInstallPlan } from './select-runtime-install-plan.js';

const LLAMA_CPP_RELEASES_URL = 'https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=30';
const execFileAsync = promisify(execFile);

interface AssetDownload {
  asset: GitHubReleaseAsset;
  expectedSha256: string | null;
}

async function runInstallStep<T>(failureMessage: string, step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (error) {
    if (error instanceof RuntimeInstallError) {
      throw error;
    }

    throw new RuntimeInstallError(failureMessage, { cause: error });
  }
}

function fetchRecentReleases(): Promise<GitHubRelease[]> {
  return runInstallStep('Не удалось получить список релизов llama.cpp.', async () => {
    const response = await fetch(LLAMA_CPP_RELEASES_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ImmersionAI-Rewrite',
      },
    });

    if (!response.ok) {
      throw new RuntimeInstallError(`Не удалось получить список релизов llama.cpp: HTTP ${response.status}.`);
    }

    const releases = GitHubReleaseListSchema.safeParse(await response.json());

    if (!releases.success) {
      throw new RuntimeInstallError('Ответ GitHub со списком релизов llama.cpp не распознан.', {
        cause: releases.error,
      });
    }

    return releases.data;
  });
}

function downloadAsset({ asset, expectedSha256 }: AssetDownload, destination: string): Promise<void> {
  return runInstallStep(`Не удалось скачать ${asset.name}.`, async () => {
    const response = await fetch(asset.browser_download_url, {
      headers: {
        'User-Agent': 'ImmersionAI-Rewrite',
      },
    });

    if (!response.ok || !response.body) {
      throw new RuntimeInstallError(`Не удалось скачать ${asset.name}: HTTP ${response.status}.`);
    }

    const hash = createHash('sha256');

    await pipeline(
      Readable.fromWeb(response.body),
      async function* hashChunks(chunks: AsyncIterable<Uint8Array>) {
        for await (const chunk of chunks) {
          hash.update(chunk);
          yield chunk;
        }
      },
      createWriteStream(destination),
    );

    if (expectedSha256 !== null && hash.digest('hex') !== expectedSha256) {
      throw new RuntimeInstallError(`Контрольная сумма ${asset.name} не совпадает с указанной в релизе llama.cpp.`);
    }
  });
}

async function extractZip(zipPath: string, destination: string) {
  await fs.mkdir(destination, { recursive: true });

  if (process.platform === 'win32') {
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'Expand-Archive -LiteralPath $env:IMMERSION_ZIP -DestinationPath $env:IMMERSION_DESTINATION -Force',
      ],
      {
        env: {
          ...process.env,
          IMMERSION_DESTINATION: destination,
          IMMERSION_ZIP: zipPath,
        },
        windowsHide: true,
      },
    );
    return;
  }

  await execFileAsync('unzip', ['-o', zipPath, '-d', destination]);
}

async function findServerDirectory(root: string): Promise<string | null> {
  const entries = await fs.readdir(root, { withFileTypes: true });

  if (entries.some((entry) => entry.isFile() && (entry.name === 'llama-server.exe' || entry.name === 'llama-server'))) {
    return root;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const nested = await findServerDirectory(path.join(root, entry.name));

    if (nested) {
      return nested;
    }
  }

  return null;
}

async function copyDirectoryContents(source: string, destination: string) {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await fs.cp(sourcePath, destinationPath, { recursive: true });
      continue;
    }

    if (entry.isFile()) {
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
}

async function removeInstallDirectory(directory: string): Promise<void> {
  try {
    await fs.rm(directory, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
  } catch (error) {
    getSharedApiLogger().warn({ err: error, directory }, 'Failed to remove the temporary llama.cpp install directory');
  }
}

async function installPlan(plan: RuntimeInstallPlan) {
  const downloads = plan.assets.map((asset) => ({ asset, expectedSha256: readAssetSha256(asset) }));
  const runtimeRoot = getPrimaryRuntimeRoot();
  const installDirectory = path.join(runtimeRoot, 'bin');
  const tempDirectory = await runInstallStep('Не удалось создать временный каталог для установки llama.cpp.', () =>
    fs.mkdtemp(path.join(runtimeRoot, '.llama-install-')),
  );

  try {
    for (const download of downloads) {
      await downloadAsset(download, path.join(tempDirectory, download.asset.name));
    }

    for (const { asset } of downloads) {
      const zipPath = path.join(tempDirectory, asset.name);
      const extractDirectory = path.join(tempDirectory, asset.name.replace(/\.zip$/i, ''));

      await runInstallStep(`Не удалось распаковать ${asset.name}.`, () => extractZip(zipPath, extractDirectory));
      await runInstallStep(
        `Не удалось скопировать файлы из ${asset.name} в bin/. Если llama-server запущен, остановите его и повторите установку.`,
        async () => {
          const serverDirectory = await findServerDirectory(extractDirectory);
          await copyDirectoryContents(serverDirectory ?? extractDirectory, installDirectory);
        },
      );
    }
  } finally {
    await removeInstallDirectory(tempDirectory);
  }
}

export async function installRuntime(command: RuntimeInstallCommand): Promise<RuntimeOverviewResponse> {
  const releases = await fetchRecentReleases();
  const plan = selectRuntimeInstallPlan(releases, command.variant);

  await installPlan(plan);

  return getRuntimeOverview();
}
