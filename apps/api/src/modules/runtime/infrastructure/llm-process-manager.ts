import { type ChildProcess, execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { RuntimeConfigCommand, RuntimeEngineInfo, RuntimeStatusSnapshot } from '@immersion/contracts/runtime';

import { resolveDataRoot } from '../../../lib/data-root.js';
import { getSharedApiLogger } from '../../../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
const PID_FILE_NAME = '.llm-server.json';
const LOG_FILE_NAME = 'llm-server.log';
// Хвоста в пару сотен килобайт хватает на стартовый вывод llama-server.
const LOG_TAIL_BYTES = 256 * 1024;

function resolveLogFilePath() {
  return path.join(resolveDataRoot(), 'logs', LOG_FILE_NAME);
}

/** Последние строки файла логов: используется, когда процесс пережил рестарт API. */
function readLogFileTail(): string[] {
  try {
    const logFilePath = resolveLogFilePath();
    const { size } = fs.statSync(logFilePath);
    const start = Math.max(0, size - LOG_TAIL_BYTES);
    const handle = fs.openSync(logFilePath, 'r');

    try {
      const buffer = Buffer.alloc(size - start);
      fs.readSync(handle, buffer, 0, buffer.length, start);

      return buffer
        .toString('utf8')
        .split(/\r?\n/u)
        .filter((line) => line.length > 0)
        .slice(-MAX_LOG_LINES);
    } finally {
      fs.closeSync(handle);
    }
  } catch {
    // Файла ещё нет — модель не запускали из этой версии приложения.
    return [];
  }
}

type RuntimeLifecycleStatus = RuntimeStatusSnapshot['status'];

export interface LlmStartConfig extends Omit<RuntimeConfigCommand, 'modelsDirs'> {
  /** Путь к mmproj-проектору; без него VL-модель запускается как текстовая. */
  mmprojPath?: string | undefined;
  modelPath: string;
}

interface PidFileData {
  pid: number;
  port: number;
  model: string;
  modelPath: string;
}

interface RuntimeBinaryLocation {
  executablePath: string;
  runtimeRoot: string;
}

export function resolveRuntimeRoots() {
  const roots = [PROJECT_ROOT];
  const basename = path.basename(PROJECT_ROOT);
  const legacySiblingName = basename.endsWith('_engineering') ? basename.replace(/_engineering$/, '') : null;

  if (legacySiblingName) {
    const siblingRoot = path.resolve(PROJECT_ROOT, '..', legacySiblingName);

    if (siblingRoot !== PROJECT_ROOT && fs.existsSync(siblingRoot)) {
      roots.push(siblingRoot);
    }
  }

  return roots;
}

export function getPrimaryRuntimeRoot() {
  return PROJECT_ROOT;
}

function findBinary(): RuntimeBinaryLocation | null {
  for (const runtimeRoot of resolveRuntimeRoots()) {
    const searchPaths = [
      path.join(runtimeRoot, 'bin', 'llama-server.exe'),
      path.join(runtimeRoot, 'bin', 'llama-server'),
      path.join(runtimeRoot, 'llama-server.exe'),
      path.join(runtimeRoot, 'llama-server'),
    ];

    for (const executablePath of searchPaths) {
      if (fs.existsSync(executablePath)) {
        return {
          executablePath,
          runtimeRoot,
        };
      }
    }
  }

  return null;
}

function getPidFilePath() {
  return path.join(resolveDataRoot(), PID_FILE_NAME);
}

function savePidFile(data: PidFileData) {
  try {
    fs.writeFileSync(getPidFilePath(), JSON.stringify(data), 'utf8');
  } catch (error) {
    getSharedApiLogger().error({ err: error }, 'llm-process: failed to save PID file');
  }
}

function readPidFile(): PidFileData | null {
  try {
    const pidFilePath = getPidFilePath();

    if (!fs.existsSync(pidFilePath)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(pidFilePath, 'utf8')) as PidFileData;
  } catch {
    return null;
  }
}

function removePidFile() {
  try {
    const pidFilePath = getPidFilePath();

    if (fs.existsSync(pidFilePath)) {
      fs.unlinkSync(pidFilePath);
    }
  } catch {
    // ignore cleanup failures
  }
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function killByPid(pid: number) {
  if (!isProcessAlive(pid)) {
    return;
  }

  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F /T`, {
        stdio: 'ignore',
        windowsHide: true,
      });
      return;
    }

    process.kill(pid, 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    if (isProcessAlive(pid)) {
      process.kill(pid, 'SIGKILL');
    }
  } catch (error) {
    getSharedApiLogger().error({ err: error, pid }, 'llm-process: failed to kill process');
  }
}

const MAX_LOG_LINES = 100;

/**
 * Owns the detached llama-server child process: spawn, PID-file tracking,
 * health polling, log ring buffer, and stop semantics. Construction has no
 * side effects; reconnection to a detached process from a previous API run
 * is an explicit call from server startup.
 */
export class LlmProcessManager {
  private childProcess: ChildProcess | null = null;
  private healthPollTimer: ReturnType<typeof setInterval> | null = null;
  private startTimeout: ReturnType<typeof setTimeout> | null = null;
  private logStream: fs.WriteStream | null = null;
  private readonly logBuffer: string[] = [];
  private readonly state: RuntimeStatusSnapshot = {
    status: 'idle',
    model: null,
    modelPath: null,
    error: null,
    port: 5001,
    pid: null,
  };

  getEngineInfo(): RuntimeEngineInfo {
    const binary = findBinary();

    return {
      found: binary !== null,
      executablePath: binary?.executablePath ?? null,
      defaultModelsDir: path.join(binary?.runtimeRoot ?? PROJECT_ROOT, 'models'),
    };
  }

  getState(): RuntimeStatusSnapshot {
    const detachedState = this.getDetachedRuntimeState();

    if (!detachedState) {
      return {
        status: this.childProcess ? this.state.status : 'idle',
        model: this.childProcess ? this.state.model : null,
        modelPath: this.childProcess ? this.state.modelPath : null,
        error: this.childProcess ? this.state.error : null,
        port: this.state.port,
        pid: this.childProcess ? this.state.pid : null,
      };
    }

    if (this.state.status === 'starting' && this.state.pid === detachedState.pid) {
      return { ...this.state };
    }

    return {
      status: 'running',
      model: detachedState.model,
      modelPath: detachedState.modelPath,
      error: null,
      port: detachedState.port,
      pid: detachedState.pid,
    };
  }

  getLogs() {
    // Буфер живёт в памяти API. Если процесс запускала предыдущая версия API
    // (tsx watch перезапускается на каждой правке), читаем хвост файла — иначе
    // логи работающей модели выглядели бы пустыми.
    return this.logBuffer.length > 0 ? [...this.logBuffer] : readLogFileTail();
  }

  async start(config: LlmStartConfig) {
    // Consult the PID file as well: right after an API restart the in-memory state
    // is still idle while a detached llama-server from the previous process is
    // alive. Starting without stopping it first would orphan that process.
    if (
      this.state.status === 'running' ||
      this.state.status === 'starting' ||
      this.state.pid ||
      this.getDetachedRuntimeState()
    ) {
      await this.stop();
    }

    const binary = findBinary();

    if (!binary) {
      throw new Error('llama-server не найден. Проверьте bin/ в основном рабочем дереве.');
    }

    this.logBuffer.length = 0;
    this.setStateStatus('starting', {
      model: path.basename(config.modelPath),
      modelPath: config.modelPath,
      error: null,
      port: config.port,
      pid: null,
    });

    const args = [
      '-m',
      config.modelPath,
      '-ngl',
      String(config.gpuLayers),
      '-c',
      String(config.contextSize),
      '--host',
      '127.0.0.1',
      '--port',
      String(config.port),
    ];

    if (config.mmprojPath) {
      args.push('--mmproj', config.mmprojPath);
    }

    if (config.flashAttention) {
      args.push('-fa', 'on');
    }

    if (config.threads > 0) {
      args.push('--threads', String(config.threads));
    }

    this.openLogFile();

    const spawned = spawn(binary.executablePath, args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.childProcess = spawned;
    this.state.pid = spawned.pid ?? null;

    if (this.state.pid) {
      savePidFile({
        pid: this.state.pid,
        port: config.port,
        model: this.state.model ?? path.basename(config.modelPath),
        modelPath: config.modelPath,
      });
    }

    spawned.stdout?.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n').filter(Boolean)) {
        this.pushLog(line);
      }
    });

    spawned.stderr?.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n').filter(Boolean)) {
        this.pushLog(`[stderr] ${line}`);
      }
    });

    spawned.on('error', (error) => {
      this.childProcess = null;
      this.setStateStatus('error', {
        error: error.message,
        pid: null,
      });
      removePidFile();
      this.cleanupTimers();
    });

    spawned.on('exit', (code) => {
      this.childProcess = null;

      if (this.state.status === 'stopping') {
        this.setStateStatus('idle', {
          model: null,
          modelPath: null,
          error: null,
          pid: null,
        });
      } else if (this.state.status !== 'idle') {
        this.setStateStatus('error', {
          error: `Process exited with code ${code ?? 'unknown'}`,
          pid: null,
        });
      }

      removePidFile();
      this.cleanupTimers();
    });

    spawned.unref();
    this.startHealthPoll(config.port);
  }

  async stop() {
    this.setStateStatus('stopping');
    await this.killCurrentProcess();
  }

  /**
   * Re-attach to a detached llama-server left by a previous API process.
   * Must be called explicitly from server startup; importing this module
   * never triggers it.
   */
  async reconnectToDetachedRuntime() {
    const pidFile = readPidFile();

    if (!pidFile) {
      return;
    }

    if (!isProcessAlive(pidFile.pid)) {
      removePidFile();
      return;
    }

    this.setStateStatus('starting', {
      model: pidFile.model,
      modelPath: pidFile.modelPath,
      error: null,
      port: pidFile.port,
      pid: pidFile.pid,
    });

    try {
      const response = await fetch(`http://127.0.0.1:${pidFile.port}/health`, {
        signal: AbortSignal.timeout(3000),
      });

      if (response.ok) {
        const payload = (await response.json()) as Record<string, unknown>;

        if (payload.status === 'ok') {
          this.setStateStatus('running', {
            error: null,
          });
          return;
        }
      }
    } catch {
      // keep polling below
    }

    this.startHealthPoll(pidFile.port);
  }

  private setStateStatus(status: RuntimeLifecycleStatus, overrides: Partial<RuntimeStatusSnapshot> = {}) {
    this.state.status = status;
    this.state.model = overrides.model ?? this.state.model;
    this.state.modelPath = overrides.modelPath ?? this.state.modelPath;
    this.state.error = overrides.error ?? this.state.error;
    this.state.port = overrides.port ?? this.state.port;
    this.state.pid = overrides.pid ?? this.state.pid;
  }

  private pushLog(line: string) {
    this.logBuffer.push(line);

    if (this.logBuffer.length > MAX_LOG_LINES) {
      this.logBuffer.shift();
    }

    try {
      this.logStream?.write(`${line}\n`);
    } catch (error) {
      getSharedApiLogger().warn({ err: error }, 'Failed to write llm-server log line');
    }
  }

  private openLogFile() {
    this.closeLogFile();

    try {
      const logFilePath = resolveLogFilePath();
      fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
      this.logStream = fs.createWriteStream(logFilePath, { flags: 'w' });
    } catch (error) {
      getSharedApiLogger().warn({ err: error }, 'Failed to open llm-server log file');
      this.logStream = null;
    }
  }

  private closeLogFile() {
    this.logStream?.end();
    this.logStream = null;
  }

  private cleanupTimers() {
    if (this.healthPollTimer) {
      clearInterval(this.healthPollTimer);
      this.healthPollTimer = null;
    }

    if (this.startTimeout) {
      clearTimeout(this.startTimeout);
      this.startTimeout = null;
    }
  }

  private startHealthPoll(port: number) {
    this.cleanupTimers();

    this.healthPollTimer = setInterval(async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(2000),
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as Record<string, unknown>;

        if (payload.status === 'ok') {
          this.setStateStatus('running', {
            error: null,
          });
          this.cleanupTimers();
        }
      } catch {
        // keep polling until ready or timeout
      }
    }, 500);

    this.startTimeout = setTimeout(
      () => {
        if (this.state.status === 'starting') {
          this.setStateStatus('error', {
            error: 'Startup timeout (5 minutes)',
          });
          void this.killCurrentProcess();
        }
      },
      5 * 60 * 1000,
    );
  }

  private getDetachedRuntimeState() {
    const pidFile = readPidFile();

    if (!pidFile) {
      return null;
    }

    if (!isProcessAlive(pidFile.pid)) {
      removePidFile();
      return null;
    }

    return pidFile;
  }

  private async killCurrentProcess() {
    const activePid = this.state.pid;
    this.cleanupTimers();

    if (this.childProcess) {
      const proc = this.childProcess;

      await new Promise<void>((resolve) => {
        const forceKillTimer = setTimeout(() => {
          if (proc.exitCode === null) {
            proc.kill('SIGKILL');
          }
        }, 5000);

        proc.once('exit', () => {
          clearTimeout(forceKillTimer);
          resolve();
        });

        proc.kill('SIGTERM');
      });
    } else if (activePid) {
      await killByPid(activePid);
    } else {
      // After an API restart the in-memory state is empty, but a detached
      // llama-server from the previous API process may still be tracked in the
      // PID file. Stop must reach it too instead of silently no-oping.
      const pidFile = readPidFile();

      if (pidFile) {
        await killByPid(pidFile.pid);
      }
    }

    this.childProcess = null;
    this.closeLogFile();
    this.setStateStatus('idle', {
      model: null,
      modelPath: null,
      error: null,
      pid: null,
    });
    removePidFile();
  }
}

let sharedManager: LlmProcessManager | null = null;

export function getLlmProcessManager(): LlmProcessManager {
  if (!sharedManager) {
    sharedManager = new LlmProcessManager();
  }

  return sharedManager;
}

export function setupGracefulShutdown() {
  process.on('SIGTERM', () => {
    process.exit(0);
  });

  process.on('SIGINT', () => {
    process.exit(0);
  });
}
