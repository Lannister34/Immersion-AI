import type { RuntimeLaunchConfig } from '@immersion/contracts/runtime';

export function sameLaunchConfig(left: RuntimeLaunchConfig, right: RuntimeLaunchConfig): boolean {
  return (
    left.contextSize === right.contextSize &&
    left.flashAttention === right.flashAttention &&
    left.gpuLayers === right.gpuLayers &&
    left.threads === right.threads
  );
}
