import { createHash } from 'node:crypto';

export interface LlamaCppAssetFixture {
  readonly browser_download_url: string;
  readonly content_type: string;
  readonly digest: string | null;
  readonly name: string;
  readonly size: number;
  readonly state: string;
}

export interface LlamaCppReleaseFixture {
  readonly assets: readonly LlamaCppAssetFixture[];
  readonly draft: boolean;
  readonly name: string;
  readonly prerelease: boolean;
  readonly published_at: string;
  readonly tag_name: string;
}

function sha256Digest(content: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

export function llamaCppAsset(
  tag: string,
  name: string,
  digest: string | null = sha256Digest(name),
): LlamaCppAssetFixture {
  return {
    browser_download_url: `https://github.com/ggml-org/llama.cpp/releases/download/${tag}/${name}`,
    content_type: 'application/zip',
    digest,
    name,
    size: 1024,
    state: 'uploaded',
  };
}

function llamaCppWindowsAssetNames(tag: string): string[] {
  return [
    'cudart-llama-bin-win-cuda-12.4-x64.zip',
    'cudart-llama-bin-win-cuda-13.4-arm64.zip',
    'cudart-llama-bin-win-cuda-13.4-x64.zip',
    `llama-${tag}-bin-win-cpu-arm64.zip`,
    `llama-${tag}-bin-win-cpu-x64.zip`,
    `llama-${tag}-bin-win-cuda-12.4-x64.zip`,
    `llama-${tag}-bin-win-cuda-13.4-arm64.zip`,
    `llama-${tag}-bin-win-cuda-13.4-x64.zip`,
    `llama-${tag}-bin-win-opencl-adreno-arm64.zip`,
    `llama-${tag}-bin-win-openvino-2026.4.1-x64.zip`,
    `llama-${tag}-bin-win-rocm-10.0-x64.zip`,
    `llama-${tag}-bin-win-sycl-x64.zip`,
    `llama-${tag}-bin-win-vulkan-arm64.zip`,
    `llama-${tag}-bin-win-vulkan-x64.zip`,
  ];
}

export function llamaCppBuildRelease(
  tag: string,
  assets: readonly LlamaCppAssetFixture[] = llamaCppWindowsAssetNames(tag).map((name) => llamaCppAsset(tag, name)),
  draft = false,
): LlamaCppReleaseFixture {
  return {
    assets,
    draft,
    name: tag,
    prerelease: true,
    published_at: '2026-10-26T22:30:51Z',
    tag_name: tag,
  };
}

export function llamaCppNightlyTagRelease(): LlamaCppReleaseFixture {
  return {
    assets: [llamaCppAsset('v0.7.0', 'nightly-tag.txt')],
    draft: false,
    name: 'v0.7.0',
    prerelease: false,
    published_at: '2026-10-20T09:00:00Z',
    tag_name: 'v0.7.0',
  };
}
