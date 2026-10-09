import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LlmProcessManager } from './llm-process-manager.js';

const execSyncMock = vi.hoisted(() => vi.fn<(command: string) => Buffer>());
const spawnMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('spawn is not available in tests');
  }),
);

vi.mock('node:child_process', () => ({ execSync: execSyncMock, spawn: spawnMock }));

const DETACHED_PID = 2_147_483_647;
const DETACHED_PORT = 59_999;

describe('LlmProcessManager', () => {
  let dataRoot = '';

  async function recordDetachedRuntime() {
    await fs.writeFile(
      path.join(dataRoot, '.llm-server.json'),
      JSON.stringify({
        pid: DETACHED_PID,
        port: DETACHED_PORT,
        model: 'model.gguf',
        modelPath: path.join(dataRoot, 'model.gguf'),
      }),
      'utf8',
    );

    const detached = { alive: true };

    vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid !== DETACHED_PID) {
        throw new Error(`Unexpected signal to process ${pid}`);
      }

      if (signal === 0 && !detached.alive) {
        throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
      }

      if (signal !== 0) {
        detached.alive = false;
      }

      return true;
    });
    execSyncMock.mockImplementation((command) => {
      if (command.includes(`/PID ${DETACHED_PID} `)) {
        detached.alive = false;
      }

      return Buffer.alloc(0);
    });

    return detached;
  }

  beforeEach(async () => {
    dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-llm-process-'));
    process.env.IMMERSION_DATA_ROOT = dataRoot;
    execSyncMock.mockReset();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.IMMERSION_DATA_ROOT;
    await fs.rm(dataRoot, { force: true, recursive: true });
  });

  it('re-attaches to a llama-server left by a previous API process only when asked, never on import or construction', async () => {
    await recordDetachedRuntime();
    const healthProbe = vi.fn(async () => new Response(JSON.stringify({ status: 'ok' })));
    vi.stubGlobal('fetch', healthProbe);

    vi.resetModules();
    const { getLlmProcessManager } = await import('./llm-process-manager.js');
    const manager = getLlmProcessManager();

    expect(healthProbe).not.toHaveBeenCalled();

    await manager.reconnectToDetachedRuntime();

    expect(healthProbe).toHaveBeenCalledWith(`http://127.0.0.1:${DETACHED_PORT}/health`, expect.anything());
  });

  it('stops a llama-server left by a previous API process before starting another, which would otherwise be orphaned', async () => {
    await recordDetachedRuntime();
    const manager = new LlmProcessManager();
    vi.spyOn(manager, 'stop').mockRejectedValueOnce(new Error('stop requested before spawn'));

    await expect(
      manager.start({
        contextSize: 8192,
        flashAttention: false,
        gpuLayers: 0,
        modelPath: path.join(dataRoot, 'model.gguf'),
        port: DETACHED_PORT,
        threads: 0,
      }),
    ).rejects.toThrow('stop requested before spawn');
  });

  it('stops a llama-server that only the PID file still tracks after an API restart, instead of no-oping', async () => {
    const detached = await recordDetachedRuntime();
    vi.useFakeTimers();

    const stopping = new LlmProcessManager().stop();
    await vi.runAllTimersAsync();
    await stopping;

    expect(detached.alive).toBe(false);
  });
});
