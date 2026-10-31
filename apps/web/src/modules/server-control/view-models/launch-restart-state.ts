import type { RuntimeLaunchConfig, RuntimeOverviewResponse, RuntimeStartCommand } from '@immersion/contracts/runtime';

import { sameLaunchConfig } from './same-launch-config';

export type LaunchRestartState =
  | { kind: 'none' }
  | { kind: 'manual'; runningConfig: RuntimeLaunchConfig | null }
  | { kind: 'restart'; command: RuntimeStartCommand; runningConfig: RuntimeLaunchConfig | null };

export function toLaunchRestartState(overview: RuntimeOverviewResponse): LaunchRestartState {
  const { serverConfig, serverStatus } = overview;

  if (serverStatus.status !== 'running') {
    return { kind: 'none' };
  }

  const runningConfig = serverStatus.launchConfig;

  if (runningConfig && sameLaunchConfig(runningConfig, serverConfig)) {
    return { kind: 'none' };
  }

  const runningModel = overview.models.find((model) => model.path === serverStatus.modelPath);

  if (!runningModel) {
    return { kind: 'manual', runningConfig };
  }

  return {
    kind: 'restart',
    command: {
      contextSize: serverConfig.contextSize,
      flashAttention: serverConfig.flashAttention,
      gpuLayers: serverConfig.gpuLayers,
      modelPath: runningModel.path,
      port: serverConfig.port,
      threads: serverConfig.threads,
      ...(runningModel.visionProjectorPath ? { mmprojPath: runningModel.visionProjectorPath } : {}),
    },
    runningConfig,
  };
}
