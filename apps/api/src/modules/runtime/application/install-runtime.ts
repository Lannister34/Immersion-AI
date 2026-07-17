import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

import {
  RuntimeInstallCommandSchema,
  type RuntimeInstallVariant,
  type RuntimeOverviewResponse,
} from '@immersion/contracts/runtime';

import { getPrimaryRuntimeRoot } from '../infrastructure/llm-process-manager.js';
import { getRuntimeOverview } from './get-runtime-overview.js';

const LLAMA_CPP_LATEST_RELEASE_URL = 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest';
const execFileAsync = promisify(execFile);

interface GitHubReleaseAsset {
  browser_download_url: string;
  name: string;
  size: number;
}

interface GitHubRelease {
  assets: GitHubReleaseAsset[];
  tag_name: string;
}

interface RuntimeInstallPlan {
  assets: GitHubReleaseAsset[];
  releaseTag: string;
  variant: RuntimeInstallVariant;
}

function getExpectedAssetNames(releaseTag: string, variant: RuntimeInstallVariant) {
  switch (variant) {
    case 'cpu':
      return [`llama-${releaseTag}-bin-win-cpu-x64.zip`];
    case 'cuda-12.4':
      return [`llama-${releaseTag}-bin-win-cuda-12.4-x64.zip`, 'cudart-llama-bin-win-cuda-12.4-x64.zip'];
    case 'cuda-13.1':
      return [`llama-${releaseTag}-bin-win-cuda-13.1-x64.zip`, 'cudart-llama-bin-win-cuda-13.1-x64.zip'];
    case 'vulkan':
      return [`llama-${releaseTag}-bin-win-vulkan-x64.zip`];
  }
}

export function selectRuntimeInstallPlan(release: GitHubRelease, variant: RuntimeInstallVariant): RuntimeInstallPlan {
  const expectedNames = getExpectedAssetNames(release.tag_name, variant);
  const assets = expectedNames.map((assetName) => release.assets.find((asset) => asset.name === assetName));
  const missingAsset = expectedNames.find((_assetName, index) => !assets[index]);

  if (missingAsset) {
    throw new Error(`В релизе llama.cpp ${release.tag_name} не найден asset ${missingAsset}.`);
  }

  return {
    assets: assets as GitHubReleaseAsset[],
    releaseTag: release.tag_name,
    variant,
  };
}

async function fetchLatestRelease(): Promise<GitHubRelease> {
  const response = await fetch(LLAMA_CPP_LATEST_RELEASE_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ImmersionAI-Rewrite',
    },
  });

  if (!response.ok) {
    throw new Error(`Не удалось получить релиз llama.cpp: HTTP ${response.status}.`);
  }

  return (await response.json()) as GitHubRelease;
}

async function downloadAsset(asset: GitHubReleaseAsset, destination: string) {
  const response = await fetch(asset.browser_download_url, {
    headers: {
      'User-Agent': 'ImmersionAI-Rewrite',
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Не удалось скачать ${asset.name}: HTTP ${response.status}.`);
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
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

async function installPlan(plan: RuntimeInstallPlan) {
  const runtimeRoot = getPrimaryRuntimeRoot();
  const installDirectory = path.join(runtimeRoot, 'bin');
  const tempDirectory = await fs.mkdtemp(path.join(runtimeRoot, '.llama-install-'));

  try {
    for (const asset of plan.assets) {
      const zipPath = path.join(tempDirectory, asset.name);
      const extractDirectory = path.join(tempDirectory, asset.name.replace(/\.zip$/i, ''));

      await downloadAsset(asset, zipPath);
      await extractZip(zipPath, extractDirectory);

      const serverDirectory = await findServerDirectory(extractDirectory);
      await copyDirectoryContents(serverDirectory ?? extractDirectory, installDirectory);
    }
  } finally {
    await fs.rm(tempDirectory, { force: true, recursive: true });
  }
}

export async function installRuntime(input: unknown): Promise<RuntimeOverviewResponse> {
  const command = RuntimeInstallCommandSchema.parse(input);
  const release = await fetchLatestRelease();
  const plan = selectRuntimeInstallPlan(release, command.variant);

  await installPlan(plan);

  return getRuntimeOverview();
}
