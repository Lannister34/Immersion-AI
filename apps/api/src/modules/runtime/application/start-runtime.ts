import fs from 'node:fs';

import { RuntimeStartCommandSchema } from '@immersion/contracts/runtime';

import { getLlmProcessManager } from '../infrastructure/llm-process-manager.js';
import { getRuntimeOverview } from './get-runtime-overview.js';

export async function startRuntime(input: unknown) {
  const command = RuntimeStartCommandSchema.parse(input);

  if (!fs.existsSync(command.modelPath)) {
    throw new Error(`Model not found: ${command.modelPath}`);
  }

  const manager = getLlmProcessManager();
  const engine = manager.getEngineInfo();

  if (!engine.found) {
    throw new Error('llama-server не найден.');
  }

  await manager.start(command);

  return getRuntimeOverview();
}
