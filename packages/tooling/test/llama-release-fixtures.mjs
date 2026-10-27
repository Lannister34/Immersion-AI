import { createHash } from 'node:crypto';

export function sha256Digest(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

export function asset(tag, name, digest = sha256Digest(name)) {
  return {
    browser_download_url: `https://github.com/ggml-org/llama.cpp/releases/download/${tag}/${name}`,
    content_type: 'application/zip',
    digest,
    name,
    size: 1024,
    state: 'uploaded',
  };
}

export function windowsAssetNames(tag) {
  return [
    'cudart-llama-bin-win-cuda-12.4-x64.zip',
    'cudart-llama-bin-win-cuda-13.4-arm64.zip',
    'cudart-llama-bin-win-cuda-13.4-x64.zip',
    `llama-${tag}-bin-win-cpu-arm64.zip`,
    `llama-${tag}-bin-win-cpu-x64.zip`,
    `llama-${tag}-bin-win-cuda-12.4-x64.zip`,
    `llama-${tag}-bin-win-cuda-13.4-arm64.zip`,
    `llama-${tag}-bin-win-cuda-13.4-x64.zip`,
    `llama-${tag}-bin-win-rocm-10.0-x64.zip`,
    `llama-${tag}-bin-win-sycl-x64.zip`,
    `llama-${tag}-bin-win-vulkan-arm64.zip`,
    `llama-${tag}-bin-win-vulkan-x64.zip`,
  ];
}

export function buildRelease(tag, assets = windowsAssetNames(tag).map((name) => asset(tag, name)), draft = false) {
  return { assets, draft, name: tag, prerelease: true, published_at: '2026-10-26T22:30:51Z', tag_name: tag };
}

export function nightlyTagRelease() {
  return {
    assets: [asset('v0.7.0', 'nightly-tag.txt')],
    draft: false,
    name: 'v0.7.0',
    prerelease: false,
    published_at: '2026-10-20T09:00:00Z',
    tag_name: 'v0.7.0',
  };
}
