import type { GitHubReleaseAsset } from './github-release-schema.js';
import { RuntimeInstallError } from './runtime-errors.js';

const SHA256_DIGEST_PATTERN = /^sha256:([0-9a-f]{64})$/iu;

export function readAssetSha256(asset: GitHubReleaseAsset): string | null {
  if (asset.digest === null || asset.digest === undefined) {
    return null;
  }

  const hex = SHA256_DIGEST_PATTERN.exec(asset.digest)?.[1];

  if (hex === undefined) {
    throw new RuntimeInstallError(`Контрольная сумма ${asset.name} в релизе llama.cpp указана в неизвестном формате.`);
  }

  return hex.toLowerCase();
}
