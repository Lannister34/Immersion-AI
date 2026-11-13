import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RuntimeBinaryMissingError, type RuntimeStartConfig } from '../modules/runtime/index.js';
import { FakeRuntimeProcess } from './fake-runtime-process.js';

const MODELS_DIR = path.join('D:', 'Модели');
const START: RuntimeStartConfig = {
  contextSize: 8192,
  flashAttention: true,
  gpuLayers: 99,
  mmprojPath: path.join(MODELS_DIR, 'mmproj-Квен-VL.gguf'),
  modelPath: path.join(MODELS_DIR, 'Квен-VL.gguf'),
  port: 5002,
  threads: 0,
};

describe('FakeRuntimeProcess', () => {
  it('starts idle with a binary it claims to have found', () => {
    const runtime = new FakeRuntimeProcess({ defaultModelsDir: MODELS_DIR });

    expect(runtime.getState()).toMatchObject({ status: 'idle', pid: null, port: 5001 });
    expect(runtime.getEngineInfo()).toMatchObject({ found: true, defaultModelsDir: MODELS_DIR });
    expect(runtime.getVisionProjectorPath()).toBeNull();
  });

  it('runs a started model with a synthetic PID, its projector and the parameters it was started with', async () => {
    const runtime = new FakeRuntimeProcess({ defaultModelsDir: MODELS_DIR });

    await runtime.start(START);

    expect(runtime.getState()).toEqual({
      status: 'running',
      model: 'Квен-VL.gguf',
      modelPath: START.modelPath,
      error: null,
      port: 5002,
      pid: 40_001,
      launchConfig: { contextSize: 8192, flashAttention: true, gpuLayers: 99, threads: 0 },
    });
    expect(runtime.getState().pid).not.toBe(process.pid);
    expect(runtime.getVisionProjectorPath()).toBe(START.mmprojPath);
    expect(runtime.starts).toEqual([START]);
  });

  it('stays starting, or ends in the scripted crash, only for the next start', async () => {
    const runtime = new FakeRuntimeProcess({ defaultModelsDir: MODELS_DIR });

    runtime.scriptNextStart('starting');
    await runtime.start(START);
    expect(runtime.getState()).toMatchObject({ status: 'starting', pid: 40_001 });

    runtime.scriptNextStart({ exitCode: 1 });
    await runtime.start(START);
    expect(runtime.getState()).toMatchObject({
      status: 'error',
      error: 'llama-server завершился с кодом 1',
      pid: null,
    });
    expect(runtime.getVisionProjectorPath()).toBeNull();

    await runtime.start(START);
    expect(runtime.getState()).toMatchObject({ status: 'running', pid: 40_003 });
    expect(runtime.stops).toBe(1);
  });

  it('crashes a running server and returns to idle on stop', async () => {
    const runtime = new FakeRuntimeProcess({ defaultModelsDir: MODELS_DIR });
    runtime.runAs({ modelPath: START.modelPath, port: 6006 });

    runtime.crash(139);
    expect(runtime.getState()).toMatchObject({ status: 'error', error: 'llama-server завершился с кодом 139' });

    await runtime.stop();
    expect(runtime.getState()).toEqual({
      status: 'idle',
      model: null,
      modelPath: null,
      error: null,
      port: 6006,
      pid: null,
      launchConfig: null,
    });
    expect(() => runtime.crash(1)).toThrow(/idle/u);
  });

  it('refuses to start without a binary, as the real manager does', async () => {
    const runtime = new FakeRuntimeProcess({ defaultModelsDir: MODELS_DIR, engineFound: false });

    await expect(runtime.start(START)).rejects.toBeInstanceOf(RuntimeBinaryMissingError);
    expect(runtime.getEngineInfo()).toMatchObject({ found: false, executablePath: null });
    expect(runtime.starts).toEqual([]);
  });

  it('counts reconnects and disposal without changing what it runs', async () => {
    const runtime = new FakeRuntimeProcess({ defaultModelsDir: MODELS_DIR });
    runtime.runAs({ modelPath: START.modelPath });

    await runtime.reconnect();
    runtime.dispose();

    expect(runtime.reconnects).toBe(1);
    expect(runtime.disposed).toBe(true);
    expect(runtime.getState().status).toBe('running');
  });
});
