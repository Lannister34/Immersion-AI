import path from 'node:path';

import { getLlmProcessManager } from '../infrastructure/llm-process-manager.js';
import { getRuntimeOverview } from './get-runtime-overview.js';

export interface RunningRuntimeEndpoint {
  baseUrl: string;
  model: string | null;
  visionProjectorPath: string | null;
}

async function resolveCanonicalModelName(modelPath: string | null, fallbackModel: string | null) {
  if (!modelPath) {
    return fallbackModel;
  }

  const normalizedModelPath = path.normalize(modelPath);
  const overview = await getRuntimeOverview();
  const runtimeModel = overview.models.find((model) => path.normalize(model.path) === normalizedModelPath);

  return runtimeModel?.name ?? fallbackModel;
}

export async function getRunningRuntimeEndpoint(): Promise<RunningRuntimeEndpoint | null> {
  const state = getLlmProcessManager().getState();

  if (state.status !== 'running') {
    return null;
  }

  return {
    baseUrl: `http://127.0.0.1:${state.port}`,
    model: await resolveCanonicalModelName(state.modelPath, state.model),
    visionProjectorPath: getLlmProcessManager().getVisionProjectorPath(),
  };
}
