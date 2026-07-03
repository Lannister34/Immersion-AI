import { type ChildProcess, execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { RuntimeConfigCommand, RuntimeEngineInfo, RuntimeStatusSnapshot } from '@immersion/contracts/runtime';

import { resolveDataRoot } from './data-root.js';
import { getSharedApiLogger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PID_FILE_NAME = '.llm-server.json';

type RuntimeLifecycleStatus = RuntimeStatusSnapshot['status'];

export interface LlmStartConfig extends Omit<RuntimeConfigCommand, 'modelsDirs'> {
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

const MAX_LOG_LINES = 100;
const logBuffer: string[] = [];

function pushLog(line: string) {
  logBuffer.push(line);

  if (logBuffer.length > MAX_LOG_LINES) {
    logBuffer.shift();
  }
}

let childProcess: ChildProcess | null = null;
let healthPollTimer: ReturnType<typeof setInterval> | null = null;
let startTimeout: ReturnType<typeof setTimeout> | null = null;

const state: RuntimeStatusSnapshot = {
  status: 'idle',
  model: null,
  modelPath: null,
  error: null,
  port: 5001,
  pid: null,
};

function setStateStatus(status: RuntimeLifecycleStatus, overrides: Partial<RuntimeStatusSnapshot> = {}) {
  state.status = status;
  state.model = overrides.model ?? state.model;
  state.modelPath = overrides.modelPath ?? state.modelPath;
  state.error = overrides.error ?? state.error;
  state.port = overrides.port ?? state.port;
  state.pid = overrides.pid ?? state.pid;
}

function cleanupTimers() {
  if (healthPollTimer) {
    clearInterval(healthPollTimer);
    healthPollTimer = null;
  }

  if (startTimeout) {
    clearTimeout(startTimeout);
    startTimeout = null;
  }
}

function startHealthPoll(port: number) {
  cleanupTimers();

  healthPollTimer = setInterval(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(2000),
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as Record<string, unknown>;

      if (payload.status === 'ok') {
        setStateStatus('running', {
          error: null,
        });
        cleanupTimers();
      }
    } catch {
      // keep polling until ready or timeout
    }
  }, 500);

  startTimeout = setTimeout(
    () => {
      if (state.status === 'starting') {
        setStateStatus('error', {
          error: 'Startup timeout (5 minutes)',
        });
        void killCurrentProcess();
      }
    },
    5 * 60 * 1000,
  );
}

function getDetachedRuntimeState() {
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

export function getEngineInfo(): RuntimeEngineInfo {
  const binary = findBinary();

  return {
    found: binary !== null,
    executablePath: binary?.executablePath ?? null,
    defaultModelsDir: path.join(binary?.runtimeRoot ?? PROJECT_ROOT, 'models'),
  };
}

export function getState(): RuntimeStatusSnapshot {
  const detachedState = getDetachedRuntimeState();

  if (!detachedState) {
    return {
      status: childProcess ? state.status : 'idle',
      model: childProcess ? state.model : null,
      modelPath: childProcess ? state.modelPath : null,
      error: childProcess ? state.error : null,
      port: state.port,
      pid: childProcess ? state.pid : null,
    };
  }

  if (state.status === 'starting' && state.pid === detachedState.pid) {
    return { ...state };
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

export function getLogs() {
  return [...logBuffer];
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

async function killCurrentProcess() {
  const activePid = state.pid;
  cleanupTimers();

  if (childProcess) {
    const proc = childProcess;

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

  childProcess = null;
  setStateStatus('idle', {
    model: null,
    modelPath: null,
    error: null,
    pid: null,
  });
  removePidFile();
}

export async function start(config: LlmStartConfig) {
  // Consult the PID file as well: right after an API restart the in-memory state
  // is still idle while a detached llama-server from the previous process is
  // alive. Starting without stopping it first would orphan that process.
  if (state.status === 'running' || state.status === 'starting' || state.pid || getDetachedRuntimeState()) {
    await stop();
  }

  const binary = findBinary();

  if (!binary) {
    throw new Error('llama-server не найден. Проверьте bin/ в основном рабочем дереве.');
  }

  logBuffer.length = 0;
  setStateStatus('starting', {
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

  if (config.flashAttention) {
    args.push('-fa', 'on');
  }

  if (config.threads > 0) {
    args.push('--threads', String(config.threads));
  }

  const spawned = spawn(binary.executablePath, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  childProcess = spawned;
  state.pid = spawned.pid ?? null;

  if (state.pid) {
    savePidFile({
      pid: state.pid,
      port: config.port,
      model: state.model ?? path.basename(config.modelPath),
      modelPath: config.modelPath,
    });
  }

  spawned.stdout?.on('data', (data: Buffer) => {
    for (const line of data.toString().split('\n').filter(Boolean)) {
      pushLog(line);
    }
  });

  spawned.stderr?.on('data', (data: Buffer) => {
    for (const line of data.toString().split('\n').filter(Boolean)) {
      pushLog(`[stderr] ${line}`);
    }
  });

  spawned.on('error', (error) => {
    childProcess = null;
    setStateStatus('error', {
      error: error.message,
      pid: null,
    });
    removePidFile();
    cleanupTimers();
  });

  spawned.on('exit', (code) => {
    childProcess = null;

    if (state.status === 'stopping') {
      setStateStatus('idle', {
        model: null,
        modelPath: null,
        error: null,
        pid: null,
      });
    } else if (state.status !== 'idle') {
      setStateStatus('error', {
        error: `Process exited with code ${code ?? 'unknown'}`,
        pid: null,
      });
    }

    removePidFile();
    cleanupTimers();
  });

  spawned.unref();
  startHealthPoll(config.port);
}

export async function stop() {
  setStateStatus('stopping');
  await killCurrentProcess();
}

async function tryReconnect() {
  const pidFile = readPidFile();

  if (!pidFile) {
    return;
  }

  if (!isProcessAlive(pidFile.pid)) {
    removePidFile();
    return;
  }

  setStateStatus('starting', {
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
        setStateStatus('running', {
          error: null,
        });
        return;
      }
    }
  } catch {
    // keep polling below
  }

  startHealthPoll(pidFile.port);
}

void tryReconnect().catch((error) => {
  getSharedApiLogger().error({ err: error }, 'llm-process: reconnect error');
});

export function setupGracefulShutdown() {
  process.on('SIGTERM', () => {
    process.exit(0);
  });

  process.on('SIGINT', () => {
    process.exit(0);
  });
}
