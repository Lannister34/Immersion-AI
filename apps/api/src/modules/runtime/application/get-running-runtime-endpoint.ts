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

  const overview = await getRuntimeOverview();
  const activeModel = overview.models.find((model) => model.isActive);

  return activeModel?.name ?? fallbackModel;
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
