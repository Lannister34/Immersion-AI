import fs from 'node:fs';
import path from 'node:path';

import type { RuntimeOverviewResponse, RuntimeStartCommand } from '@immersion/contracts/runtime';

import { isSameModelFile } from '../domain/same-model-file.js';
import { type GetRuntimeOverviewDependencies, getRuntimeOverview } from './get-runtime-overview.js';
import { DEFAULT_RUNTIME_CONTEXT_SIZE } from './runtime-config.js';
import {
  RuntimeBinaryMissingError,
  RuntimeModelNotFoundError,
  RuntimeProjectorNotFoundError,
} from './runtime-errors.js';
import type { LaunchContextSource } from './runtime-ports.js';
import type { RuntimeProcess } from './runtime-process.js';

export interface StartRuntimeDependencies extends GetRuntimeOverviewDependencies {
  readonly launchContext: LaunchContextSource;
  readonly runtimeProcess: Pick<RuntimeProcess, 'getEngineInfo' | 'getState' | 'start'>;
}

async function resolveLaunchContextSize(modelPath: string, dependencies: StartRuntimeDependencies): Promise<number> {
  const overview = await getRuntimeOverview(dependencies);
  const model = overview.models.find((candidate) => isSameModelFile(candidate.path, modelPath, process.platform));
  const contextSize = dependencies.launchContext.contextSizeForModel(model?.name ?? path.basename(modelPath));

  return contextSize > 0 ? contextSize : DEFAULT_RUNTIME_CONTEXT_SIZE;
}

export async function startRuntime(
  command: RuntimeStartCommand,
  dependencies: StartRuntimeDependencies,
): Promise<RuntimeOverviewResponse> {
  if (!fs.existsSync(command.modelPath)) {
    throw new RuntimeModelNotFoundError(command.modelPath);
  }

  if (command.mmprojPath && !fs.existsSync(command.mmprojPath)) {
    throw new RuntimeProjectorNotFoundError(command.mmprojPath);
  }

  if (!dependencies.runtimeProcess.getEngineInfo().found) {
    throw new RuntimeBinaryMissingError();
  }

  const contextSize = command.contextSize ?? (await resolveLaunchContextSize(command.modelPath, dependencies));

  await dependencies.runtimeProcess.start({ ...command, contextSize });

  return getRuntimeOverview(dependencies);
}
