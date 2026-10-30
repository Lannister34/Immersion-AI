import { describe, expect, it } from 'vitest';

import type { GitHubReleaseAsset } from './github-release-schema.js';
import { readAssetSha256 } from './read-asset-sha256.js';

const HEX = '97aef992bec5f251cef90214af209da2e430b01b57419ab427418a0c41f5cb24';

function asset(digest: string | null | undefined): GitHubReleaseAsset {
  return {
    browser_download_url: 'https://github.com/ggml-org/llama.cpp/releases/download/b11912/llama.zip',
    digest,
    name: 'llama.zip',
  };
}

describe('readAssetSha256', () => {
  it('reads the hex of a sha256 digest as GitHub publishes it', () => {
    expect(readAssetSha256(asset(`sha256:${HEX}`))).toBe(HEX);
  });

  it('reads an upper-case digest as the lower-case hex a node hash prints', () => {
    expect(readAssetSha256(asset(`sha256:${HEX.toUpperCase()}`))).toBe(HEX);
  });

  it.each([null, undefined])('has nothing to check when GitHub gives the digest as %s', (digest) => {
    expect(readAssetSha256(asset(digest))).toBeNull();
  });

  it.each([
    'md5:0123456789abcdef',
    `sha256:${HEX.slice(1)}`,
    `sha512:${HEX}${HEX}`,
    HEX,
    `sha256:${HEX} `,
  ])('refuses the digest %s, which is not a sha256 of 64 hex digits', (digest) => {
    expect(() => readAssetSha256(asset(digest))).toThrow(
      'Контрольная сумма llama.zip в релизе llama.cpp указана в неизвестном формате.',
    );
  });
});
