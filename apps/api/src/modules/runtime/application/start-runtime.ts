import fs from 'node:fs';

import type { RuntimeOverviewResponse, RuntimeStartCommand } from '@immersion/contracts/runtime';

import { getLlmProcessManager } from '../infrastructure/llm-process-manager.js';
import { getRuntimeOverview } from './get-runtime-overview.js';
import {
  RuntimeBinaryMissingError,
  RuntimeModelNotFoundError,
  RuntimeProjectorNotFoundError,
} from './runtime-errors.js';

export async function startRuntime(command: RuntimeStartCommand): Promise<RuntimeOverviewResponse> {
  if (!fs.existsSync(command.modelPath)) {
    throw new RuntimeModelNotFoundError(command.modelPath);
  }

  if (command.mmprojPath && !fs.existsSync(command.mmprojPath)) {
    throw new RuntimeProjectorNotFoundError(command.mmprojPath);
  }

  const manager = getLlmProcessManager();
  const engine = manager.getEngineInfo();

  if (!engine.found) {
    throw new RuntimeBinaryMissingError();
  }

  await manager.start(command);

  return getRuntimeOverview();
}
