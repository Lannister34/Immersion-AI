import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stubGlobalFetch } from '../../../test-support/global-fetch-stub.js';
import { useTemporaryDataRoot } from '../../../test-support/use-temporary-data-root.js';
import { LlmProcessManager, type LlmStartConfig } from './llm-process-manager.js';

class FakeLlamaServer extends EventEmitter {
  readonly pid: number | undefined;
  exitCode: number | null = null;
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();

  constructor(pid: number | undefined) {
    super();
    this.pid = pid;
  }

  exit(code: number) {
    this.exitCode = code;
    this.emit('exit', code);
  }

  kill(): boolean {
    queueMicrotask(() => this.exit(0));
    return true;
  }

  unref() {}
}

const execSyncMock = vi.hoisted(() => vi.fn<(command: string) => Buffer>());
const spawnMock = vi.hoisted(() =>
  vi.fn<() => EventEmitter>(() => {
    throw new Error('spawn is not available in tests');
  }),
);
const runtimeProjectRoot = vi.hoisted(() => ({ current: null as string | null }));

vi.mock('node:child_process', () => ({ execSync: execSyncMock, spawn: spawnMock }));
vi.mock('../../../config/find-project-root.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../config/find-project-root.js')>();

  return {
    ...actual,
    findProjectRoot: (startDirectory: string) => runtimeProjectRoot.current ?? actual.findProjectRoot(startDirectory),
  };
});

const DETACHED_PID = 2_147_483_647;
const DETACHED_PORT = 59_999;

describe('LlmProcessManager', () => {
  const dataRoot = useTemporaryDataRoot();

  async function recordDetachedRuntime() {
    await fs.writeFile(
      path.join(dataRoot(), '.llm-server.json'),
      JSON.stringify({
        pid: DETACHED_PID,
        port: DETACHED_PORT,
        model: 'model.gguf',
        modelPath: path.join(dataRoot(), 'model.gguf'),
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

  async function arrangeFakeLlamaServers(pids: number[] = []) {
    const projectRoot = path.dirname(dataRoot());
    await fs.mkdir(path.join(projectRoot, 'bin'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'bin', 'llama-server'), '');
    runtimeProjectRoot.current = projectRoot;
    vi.useFakeTimers();

    const servers: FakeLlamaServer[] = [];
    spawnMock.mockImplementation(() => {
      const server = new FakeLlamaServer(pids[servers.length]);
      servers.push(server);
      return server;
    });

    const config: LlmStartConfig = {
      contextSize: 2048,
      flashAttention: false,
      gpuLayers: 0,
      modelPath: path.join(dataRoot(), 'Модель-gemma4.gguf'),
      port: DETACHED_PORT,
      threads: 0,
    };

    return { config, servers };
  }

  beforeEach(() => {
    execSyncMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    runtimeProjectRoot.current = null;
    spawnMock.mockReset();
  });

  it('re-attaches to a llama-server left by a previous API process only when asked, never on import or construction', async () => {
    await recordDetachedRuntime();
    const http = stubGlobalFetch();
    http.on('GET', `http://127.0.0.1:${DETACHED_PORT}/health`, () => Response.json({ status: 'ok' }));

    vi.resetModules();
    const { getLlmProcessManager } = await import('./llm-process-manager.js');
    const manager = getLlmProcessManager();

    expect(http.requests).toEqual([]);

    await manager.reconnectToDetachedRuntime();

    expect(http.requestLines()).toEqual([`GET http://127.0.0.1:${DETACHED_PORT}/health`]);
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
        modelPath: path.join(dataRoot(), 'model.gguf'),
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

  it('reports a llama-server that exits while loading as an error instead of idle', async () => {
    const { config, servers } = await arrangeFakeLlamaServers();
    const manager = new LlmProcessManager();

    await manager.start(config);
    servers[0]?.exit(1);

    expect(manager.getState()).toEqual({
      status: 'error',
      model: 'Модель-gemma4.gguf',
      modelPath: config.modelPath,
      error: 'llama-server завершился с кодом 1',
      port: DETACHED_PORT,
      pid: null,
    });

    await manager.stop();
  });

  it('clears the previous crash when a model is started again', async () => {
    const { config, servers } = await arrangeFakeLlamaServers();
    const manager = new LlmProcessManager();

    await manager.start(config);
    servers[0]?.exit(1);
    await manager.start(config);

    expect(manager.getState()).toMatchObject({ status: 'starting', error: null });

    await manager.stop();
  });

  it('never signals the PID of a crashed llama-server when the next model starts, since the OS may have reused it', async () => {
    const crashedPid = 2_147_483_600;
    const nextPid = 2_147_483_601;
    const { config, servers } = await arrangeFakeLlamaServers([crashedPid, nextPid]);
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    const manager = new LlmProcessManager();

    await manager.start(config);
    servers[0]?.exit(1);
    await manager.start(config);

    expect(kill).not.toHaveBeenCalledWith(crashedPid, expect.anything());
    expect(execSyncMock).not.toHaveBeenCalled();
    expect(manager.getState()).toMatchObject({ status: 'starting', pid: nextPid });

    await manager.stop();
  });

  it('returns to idle without the previous crash after stop', async () => {
    const { config, servers } = await arrangeFakeLlamaServers();
    const manager = new LlmProcessManager();

    await manager.start(config);
    servers[0]?.exit(1);
    await manager.stop();

    expect(manager.getState()).toEqual({
      status: 'idle',
      model: null,
      modelPath: null,
      error: null,
      port: DETACHED_PORT,
      pid: null,
    });
  });
});
