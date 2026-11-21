import type { RuntimeLaunchConfig } from '@immersion/contracts/runtime';

export type LaunchFlags = Omit<RuntimeLaunchConfig, 'contextSize'>;

export function sameLaunchFlags(left: LaunchFlags, right: LaunchFlags): boolean {
  return (
    left.flashAttention === right.flashAttention && left.gpuLayers === right.gpuLayers && left.threads === right.threads
  );
}
