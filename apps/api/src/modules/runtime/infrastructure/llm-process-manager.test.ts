import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type CapturingLogger, createCapturingLogger } from '../../../test-support/capturing-logger.js';
import { createHttpStub, type HttpStub } from '../../../test-support/http-stub.js';
import { useTemporaryDataRoot } from '../../../test-support/use-temporary-data-root.js';
import type { RuntimeStartConfig } from '../application/runtime-process.js';
import { LlmProcessManager } from './llm-process-manager.js';

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

vi.mock('node:child_process', () => ({ execSync: execSyncMock, spawn: spawnMock }));

const DETACHED_PID = 2_147_483_647;
const DETACHED_PORT = 59_999;

describe('LlmProcessManager', () => {
  const dataRoot = useTemporaryDataRoot();
  let http: HttpStub;
  let logs: CapturingLogger;

  function createManager(): LlmProcessManager {
    return new LlmProcessManager({
      dataRoot: dataRoot(),
      httpFetch: http.fetch,
      logger: logs.logger,
      projectRoot: path.dirname(dataRoot()),
    });
  }

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
    vi.useFakeTimers();

    const servers: FakeLlamaServer[] = [];
    spawnMock.mockImplementation(() => {
      const server = new FakeLlamaServer(pids[servers.length]);
      servers.push(server);
      return server;
    });

    const config: RuntimeStartConfig = {
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
    http = createHttpStub();
    logs = createCapturingLogger();
  });

  afterEach(() => {
    vi.useRealTimers();
    spawnMock.mockReset();
  });

  it('re-attaches to a llama-server left by a previous API process only when asked, never on construction', async () => {
    await recordDetachedRuntime();
    http.on('GET', `http://127.0.0.1:${DETACHED_PORT}/health`, () => Response.json({ status: 'ok' }));

    const manager = createManager();

    expect(http.requests).toEqual([]);

    await manager.reconnect();

    expect(http.requestLines()).toEqual([`GET http://127.0.0.1:${DETACHED_PORT}/health`]);
    expect(manager.getState()).toMatchObject({ status: 'running', pid: DETACHED_PID });
  });

  it('reconnects to nothing and asks nothing when no PID file was left behind', async () => {
    const manager = createManager();

    await manager.reconnect();

    expect(http.requests).toEqual([]);
    expect(manager.getState()).toMatchObject({ status: 'idle', pid: null });
  });

  it('keeps the PID file and the log in the data root it was given', async () => {
    const { config } = await arrangeFakeLlamaServers([2_147_483_603]);
    vi.spyOn(process, 'kill').mockReturnValue(true);
    const manager = createManager();

    await manager.start(config);
    const pidFile = JSON.parse(await fs.readFile(path.join(dataRoot(), '.llm-server.json'), 'utf8'));
    await manager.stop();

    expect(pidFile).toMatchObject({ pid: 2_147_483_603, port: DETACHED_PORT });
    await expect(fs.stat(path.join(dataRoot(), 'logs', 'llm-server.log'))).resolves.toBeDefined();
  });

  it('stops polling the health of a starting server once disposed, without stopping the server', async () => {
    const { config, servers } = await arrangeFakeLlamaServers([2_147_483_604]);
    vi.spyOn(process, 'kill').mockReturnValue(true);
    const manager = createManager();

    await manager.start(config);
    manager.dispose();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(http.requests).toEqual([]);
    expect(servers[0]?.exitCode).toBeNull();
    expect(manager.getState()).toMatchObject({ status: 'starting', pid: 2_147_483_604 });
  });

  it('arms no health poll after disposal, even when a reconnect finishes later', async () => {
    await recordDetachedRuntime();
    vi.useFakeTimers();
    http.on('GET', `http://127.0.0.1:${DETACHED_PORT}/health`, () => Response.json({ status: 'loading' }));
    const manager = createManager();

    const reconnecting = manager.reconnect();
    manager.dispose();
    await reconnecting;
    await vi.advanceTimersByTimeAsync(5_000);

    expect(http.requestLines()).toEqual([`GET http://127.0.0.1:${DETACHED_PORT}/health`]);
  });

  it('stops a llama-server left by a previous API process before starting another, which would otherwise be orphaned', async () => {
    await recordDetachedRuntime();
    const manager = createManager();
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

    const stopping = createManager().stop();
    await vi.runAllTimersAsync();
    await stopping;

    expect(detached.alive).toBe(false);
  });

  it('reports a llama-server that exits while loading as an error instead of idle', async () => {
    const { config, servers } = await arrangeFakeLlamaServers();
    const manager = createManager();

    await manager.start(config);
    servers[0]?.exit(1);

    expect(manager.getState()).toEqual({
      status: 'error',
      model: 'Модель-gemma4.gguf',
      modelPath: config.modelPath,
      error: 'llama-server завершился с кодом 1',
      port: DETACHED_PORT,
      pid: null,
      launchConfig: { contextSize: 2048, flashAttention: false, gpuLayers: 0, threads: 0 },
    });

    await manager.stop();
  });

  it('clears the previous crash when a model is started again', async () => {
    const { config, servers } = await arrangeFakeLlamaServers();
    const manager = createManager();

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
    const manager = createManager();

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
    const manager = createManager();

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
      launchConfig: null,
    });
  });

  it('reports the launch parameters the server was started with, not the saved ones, which may have changed since', async () => {
    const pid = 2_147_483_602;
    const { config } = await arrangeFakeLlamaServers([pid]);
    vi.spyOn(process, 'kill').mockReturnValue(true);
    const manager = createManager();

    await manager.start({ ...config, contextSize: 8192, flashAttention: true, gpuLayers: 99, threads: 6 });

    const expected = { contextSize: 8192, flashAttention: true, gpuLayers: 99, threads: 6 };
    expect(manager.getState().launchConfig).toEqual(expected);
    expect(createManager().getState()).toMatchObject({ status: 'running', pid, launchConfig: expected });

    await manager.stop();
  });

  it('reports unknown launch parameters for a llama-server whose PID file predates them, instead of guessing', async () => {
    await recordDetachedRuntime();

    expect(createManager().getState()).toMatchObject({ status: 'running', launchConfig: null });
    expect(logs.lines).toEqual([]);
  });

  it('logs a malformed launchConfig in the PID file once and reports it as unknown, since the record is the server fault', async () => {
    await recordDetachedRuntime();
    const pidFilePath = path.join(dataRoot(), '.llm-server.json');
    const record = JSON.parse(await fs.readFile(pidFilePath, 'utf8')) as Record<string, unknown>;
    await fs.writeFile(pidFilePath, JSON.stringify({ ...record, launchConfig: { contextSize: 'восемь тысяч' } }));
    const manager = createManager();

    expect(manager.getState()).toMatchObject({ status: 'running', launchConfig: null });
    expect(manager.getState().launchConfig).toBeNull();
    expect(logs.lines).toEqual([expect.objectContaining({ level: 'warn', pid: DETACHED_PID })]);
  });
});
