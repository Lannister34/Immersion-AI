import type { RuntimeInstallVariant } from '@immersion/contracts/runtime';

import type { GitHubRelease, GitHubReleaseAsset } from './github-release-schema.js';
import { RuntimeInstallError } from './runtime-errors.js';

const BUILD_TAG_PATTERN = /^b(\d+)$/u;

export interface RuntimeInstallPlan {
  assets: GitHubReleaseAsset[];
  releaseTag: string;
  variant: RuntimeInstallVariant;
}

interface BuildRelease {
  buildNumber: number;
  release: GitHubRelease;
}

function getExpectedAssetNames(releaseTag: string, variant: RuntimeInstallVariant): string[] {
  switch (variant) {
    case 'cpu':
      return [`llama-${releaseTag}-bin-win-cpu-x64.zip`];
    case 'cuda-12.4':
      return [`llama-${releaseTag}-bin-win-cuda-12.4-x64.zip`, 'cudart-llama-bin-win-cuda-12.4-x64.zip'];
    case 'cuda-13.4':
      return [`llama-${releaseTag}-bin-win-cuda-13.4-x64.zip`, 'cudart-llama-bin-win-cuda-13.4-x64.zip'];
    case 'vulkan':
      return [`llama-${releaseTag}-bin-win-vulkan-x64.zip`];
  }
}

function toBuildRelease(release: GitHubRelease): BuildRelease | null {
  const match = BUILD_TAG_PATTERN.exec(release.tag_name);

  if (release.draft || match?.[1] === undefined) {
    return null;
  }

  return { buildNumber: Number(match[1]), release };
}

function findAssets(release: GitHubRelease, names: string[]): GitHubReleaseAsset[] | null {
  const assets: GitHubReleaseAsset[] = [];

  for (const name of names) {
    const asset = release.assets.find((candidate) => candidate.name === name);

    if (asset === undefined) {
      return null;
    }

    assets.push(asset);
  }

  return assets;
}

export function selectRuntimeInstallPlan(
  releases: readonly GitHubRelease[],
  variant: RuntimeInstallVariant,
): RuntimeInstallPlan {
  const builds = releases
    .map(toBuildRelease)
    .filter((build) => build !== null)
    .sort((left, right) => right.buildNumber - left.buildNumber);
  const newest = builds[0];

  if (newest === undefined) {
    throw new RuntimeInstallError('Среди последних релизов llama.cpp не найдено ни одной сборки.');
  }

  for (const { release } of builds) {
    const assets = findAssets(release, getExpectedAssetNames(release.tag_name, variant));

    if (assets !== null) {
      return { assets, releaseTag: release.tag_name, variant };
    }
  }

  const newestNames = getExpectedAssetNames(newest.release.tag_name, variant);
  const missingAsset = newestNames.find((name) => !newest.release.assets.some((asset) => asset.name === name));

  throw new RuntimeInstallError(
    `В последних сборках llama.cpp (до ${newest.release.tag_name}) не найден asset ${missingAsset}.`,
  );
}
