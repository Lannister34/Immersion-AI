import { type GetRuntimeOverviewDependencies, getRuntimeOverview } from './get-runtime-overview.js';
import type { RuntimeProcess } from './runtime-process.js';

export interface RunningRuntimeEndpoint {
  baseUrl: string;
  contextSize: number | null;
  model: string | null;
  visionProjectorPath: string | null;
}

export interface GetRunningRuntimeEndpointDependencies extends GetRuntimeOverviewDependencies {
  readonly runtimeProcess: Pick<RuntimeProcess, 'getEngineInfo' | 'getState' | 'getVisionProjectorPath'>;
}

async function resolveCanonicalModelName(
  modelPath: string | null,
  fallbackModel: string | null,
  dependencies: GetRuntimeOverviewDependencies,
) {
  if (!modelPath) {
    return fallbackModel;
  }

  const overview = await getRuntimeOverview(dependencies);
  const activeModel = overview.models.find((model) => model.isActive);

  return activeModel?.name ?? fallbackModel;
}

export async function getRunningRuntimeEndpoint(
  dependencies: GetRunningRuntimeEndpointDependencies,
): Promise<RunningRuntimeEndpoint | null> {
  const state = dependencies.runtimeProcess.getState();

  if (state.status !== 'running') {
    return null;
  }

  return {
    baseUrl: `http://127.0.0.1:${state.port}`,
    contextSize: state.launchConfig?.contextSize ?? null,
    model: await resolveCanonicalModelName(state.modelPath, state.model, dependencies),
    visionProjectorPath: dependencies.runtimeProcess.getVisionProjectorPath(),
  };
}
