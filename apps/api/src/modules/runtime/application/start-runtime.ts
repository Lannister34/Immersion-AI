import fs from 'node:fs';

import type { RuntimeOverviewResponse, RuntimeStartCommand } from '@immersion/contracts/runtime';

import { type GetRuntimeOverviewDependencies, getRuntimeOverview } from './get-runtime-overview.js';
import {
  RuntimeBinaryMissingError,
  RuntimeModelNotFoundError,
  RuntimeProjectorNotFoundError,
} from './runtime-errors.js';
import type { RuntimeProcess } from './runtime-process.js';

export interface StartRuntimeDependencies extends GetRuntimeOverviewDependencies {
  readonly runtimeProcess: Pick<RuntimeProcess, 'getEngineInfo' | 'getState' | 'start'>;
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

  await dependencies.runtimeProcess.start(command);

  return getRuntimeOverview(dependencies);
}
