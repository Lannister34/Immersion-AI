import type {
  ApplyRuntimeContextCommand,
  RuntimeOverviewResponse,
  RuntimeStatusSnapshot,
} from '@immersion/contracts/runtime';

import { type GetRuntimeOverviewDependencies, getRuntimeOverview } from './get-runtime-overview.js';
import {
  GenerationInProgressError,
  RuntimeContextApplyFailedError,
  RuntimeLaunchUnknownError,
  RuntimeNotRunningError,
} from './runtime-errors.js';
import type { GenerationActivity } from './runtime-ports.js';
import type { RuntimeProcess, RuntimeStartConfig } from './runtime-process.js';

export interface ApplyRuntimeContextDependencies extends GetRuntimeOverviewDependencies {
  readonly generationActivity: GenerationActivity;
  readonly runtimeProcess: Pick<
    RuntimeProcess,
    'getEngineInfo' | 'getState' | 'getVisionProjectorPath' | 'start' | 'waitUntilSettled'
  >;
}

function readRunningLaunch(state: RuntimeStatusSnapshot, mmprojPath: string | null): RuntimeStartConfig {
  if (state.status !== 'running' || state.modelPath === null) {
    throw new RuntimeNotRunningError();
  }

  if (state.launchConfig === null) {
    throw new RuntimeLaunchUnknownError();
  }

  return {
    ...state.launchConfig,
    modelPath: state.modelPath,
    port: state.port,
    ...(mmprojPath ? { mmprojPath } : {}),
  };
}

function describeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'неизвестная ошибка';
}

type LaunchOutcome =
  | { kind: 'running' }
  | { kind: 'failed'; reason: string }
  | { kind: 'other'; status: RuntimeStatusSnapshot['status'] };

function isOwnLaunch(state: RuntimeStatusSnapshot, launch: RuntimeStartConfig): boolean {
  return state.modelPath === launch.modelPath && state.launchConfig?.contextSize === launch.contextSize;
}

async function startAndSettle(
  launch: RuntimeStartConfig,
  runtimeProcess: ApplyRuntimeContextDependencies['runtimeProcess'],
): Promise<LaunchOutcome> {
  try {
    await runtimeProcess.start(launch);
  } catch (error) {
    return { kind: 'failed', reason: describeError(error) };
  }

  const settled = await runtimeProcess.waitUntilSettled();

  if (!isOwnLaunch(settled, launch)) {
    return { kind: 'other', status: settled.status };
  }

  if (settled.status === 'running') {
    return { kind: 'running' };
  }

  if (settled.status === 'error') {
    return { kind: 'failed', reason: settled.error ?? 'неизвестная ошибка' };
  }

  return { kind: 'other', status: settled.status };
}

function describeRollback(outcome: LaunchOutcome): string | null {
  if (outcome.kind === 'failed') {
    return outcome.reason;
  }

  return outcome.kind === 'other' ? `сервер перешёл в состояние ${outcome.status}` : null;
}

export async function applyRuntimeContext(
  command: ApplyRuntimeContextCommand,
  dependencies: ApplyRuntimeContextDependencies,
): Promise<RuntimeOverviewResponse> {
  const { runtimeProcess } = dependencies;
  const running = readRunningLaunch(runtimeProcess.getState(), runtimeProcess.getVisionProjectorPath());

  if (running.contextSize === command.contextSize) {
    return getRuntimeOverview(dependencies);
  }

  if (dependencies.generationActivity.hasActiveGeneration()) {
    throw new GenerationInProgressError();
  }

  const outcome = await startAndSettle({ ...running, contextSize: command.contextSize }, runtimeProcess);

  if (outcome.kind === 'failed') {
    const rollback = await startAndSettle(running, runtimeProcess);

    throw new RuntimeContextApplyFailedError({
      previousContextSize: running.contextSize,
      reason: outcome.reason,
      requestedContextSize: command.contextSize,
      rollbackFailure: describeRollback(rollback),
    });
  }

  return getRuntimeOverview(dependencies);
}
