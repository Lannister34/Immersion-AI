import type { RuntimeLaunchConfig, RuntimeOverviewResponse } from '@immersion/contracts/runtime';
import { describe, expect, it } from 'vitest';

import { toLaunchRestartState } from './launch-restart-state';

const MODEL_PATH = 'D:/Модели/Гемма-27B.gguf';
const SAVED: RuntimeLaunchConfig = { contextSize: 32_256, flashAttention: true, gpuLayers: 99, threads: 0 };

function overview(
  status: RuntimeOverviewResponse['serverStatus']['status'],
  launchConfig: RuntimeLaunchConfig | null,
  modelPath = MODEL_PATH,
  visionProjectorPath: string | null = null,
): RuntimeOverviewResponse {
  return {
    engine: { found: true, executablePath: 'bin/llama-server', defaultModelsDir: 'models' },
    serverStatus: { status, model: 'Гемма-27B.gguf', modelPath, error: null, port: 5001, pid: 4242, launchConfig },
    serverConfig: { modelsDirs: ['D:/Модели'], port: 5002, ...SAVED },
    models: [{ name: 'Гемма-27B.gguf', path: MODEL_PATH, size: 1, sourceDirectory: 'D:/Модели', visionProjectorPath }],
    modelsDirsStatus: [{ path: 'D:/Модели', exists: true }],
  };
}

describe('toLaunchRestartState', () => {
  it('asks for nothing while the running model already uses the saved parameters', () => {
    expect(toLaunchRestartState(overview('running', SAVED))).toEqual({ kind: 'none' });
  });

  it('asks for nothing while no model runs, since the next start takes the saved parameters', () => {
    expect(toLaunchRestartState(overview('idle', null))).toEqual({ kind: 'none' });
    expect(toLaunchRestartState(overview('error', { ...SAVED, contextSize: 8192 }))).toEqual({ kind: 'none' });
  });

  it('restarts the running model with the saved parameters and its own projector when any of them differs', () => {
    const running = { ...SAVED, contextSize: 8192 };

    expect(toLaunchRestartState(overview('running', running, MODEL_PATH, 'D:/Модели/mmproj-Гемма.gguf'))).toEqual({
      kind: 'restart',
      command: { ...SAVED, modelPath: MODEL_PATH, mmprojPath: 'D:/Модели/mmproj-Гемма.gguf', port: 5002 },
      runningConfig: running,
    });
    expect(toLaunchRestartState(overview('running', { ...SAVED, flashAttention: false }))).toMatchObject({
      kind: 'restart',
    });
  });

  it('offers a restart when the running parameters are unknown, as for a server started before they were recorded', () => {
    expect(toLaunchRestartState(overview('running', null))).toMatchObject({ kind: 'restart', runningConfig: null });
  });

  it('asks for a manual restart when the running model is not in the list, so its projector cannot be known', () => {
    expect(toLaunchRestartState(overview('running', null, 'C:/elsewhere/model.gguf'))).toEqual({
      kind: 'manual',
      runningConfig: null,
    });
  });
});
