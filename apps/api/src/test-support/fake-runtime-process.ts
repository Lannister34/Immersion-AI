import path from 'node:path';

import type { RuntimeEngineInfo, RuntimeLaunchConfig, RuntimeStatusSnapshot } from '@immersion/contracts/runtime';

import { RuntimeBinaryMissingError, type RuntimeProcess, type RuntimeStartConfig } from '../modules/runtime/index.js';

export type FakeStartOutcome = 'running' | 'starting' | { readonly exitCode: number };

export interface FakeRuntimeProcessOptions {
  readonly defaultModelsDir: string;
  readonly engineFound?: boolean;
  readonly port?: number;
}

export interface FakeRunningServer {
  readonly modelPath: string;
  readonly port?: number;
  readonly mmprojPath?: string | null;
  readonly launchConfig?: RuntimeLaunchConfig | null;
}

const FIRST_SYNTHETIC_PID = 40_001;
const DEFAULT_PORT = 5001;

function idleState(port: number): RuntimeStatusSnapshot {
  return { status: 'idle', model: null, modelPath: null, error: null, port, pid: null, launchConfig: null };
}

function launchConfigOf(config: RuntimeStartConfig): RuntimeLaunchConfig {
  return {
    contextSize: config.contextSize,
    flashAttention: config.flashAttention,
    gpuLayers: config.gpuLayers,
    threads: config.threads,
  };
}

export class FakeRuntimeProcess implements RuntimeProcess {
  readonly starts: RuntimeStartConfig[] = [];
  reconnects = 0;
  stops = 0;
  disposed = false;
  private readonly defaultModelsDir: string;
  private readonly engineFound: boolean;
  private readonly logs: string[] = [];
  private nextPid = FIRST_SYNTHETIC_PID;
  private nextOutcome: FakeStartOutcome = 'running';
  private state: RuntimeStatusSnapshot;
  private visionProjectorPath: string | null = null;

  constructor({ defaultModelsDir, engineFound = true, port = DEFAULT_PORT }: FakeRuntimeProcessOptions) {
    this.defaultModelsDir = defaultModelsDir;
    this.engineFound = engineFound;
    this.state = idleState(port);
  }

  scriptNextStart(outcome: FakeStartOutcome): void {
    this.nextOutcome = outcome;
  }

  runAs({ launchConfig = null, mmprojPath = null, modelPath, port = this.state.port }: FakeRunningServer): void {
    this.visionProjectorPath = mmprojPath;
    this.state = {
      status: 'running',
      model: path.basename(modelPath),
      modelPath,
      error: null,
      port,
      pid: this.claimPid(),
      launchConfig,
    };
  }

  crash(exitCode: number): void {
    if (this.state.status !== 'running' && this.state.status !== 'starting') {
      throw new Error(`A fake llama-server can crash only while it runs or starts, not while ${this.state.status}.`);
    }

    this.state = { ...this.state, status: 'error', error: `llama-server завершился с кодом ${exitCode}`, pid: null };
  }

  appendLog(line: string): void {
    this.logs.push(line);
  }

  getState(): RuntimeStatusSnapshot {
    return { ...this.state };
  }

  getEngineInfo(): RuntimeEngineInfo {
    return {
      found: this.engineFound,
      executablePath: this.engineFound ? path.join(path.dirname(this.defaultModelsDir), 'bin', 'llama-server') : null,
      defaultModelsDir: this.defaultModelsDir,
    };
  }

  getVisionProjectorPath(): string | null {
    return this.state.status === 'running' ? this.visionProjectorPath : null;
  }

  getLogs(): string[] {
    return [...this.logs];
  }

  async start(config: RuntimeStartConfig): Promise<void> {
    if (!this.engineFound) {
      throw new RuntimeBinaryMissingError();
    }

    if (this.state.status === 'running' || this.state.status === 'starting') {
      await this.stop();
    }

    this.starts.push(config);
    const outcome = this.nextOutcome;
    this.nextOutcome = 'running';
    this.visionProjectorPath = config.mmprojPath ?? null;
    this.state = {
      status: outcome === 'running' ? 'running' : 'starting',
      model: path.basename(config.modelPath),
      modelPath: config.modelPath,
      error: null,
      port: config.port,
      pid: this.claimPid(),
      launchConfig: launchConfigOf(config),
    };

    if (typeof outcome === 'object') {
      this.crash(outcome.exitCode);
    }
  }

  async stop(): Promise<void> {
    this.stops += 1;
    this.visionProjectorPath = null;
    this.state = idleState(this.state.port);
  }

  async reconnect(): Promise<void> {
    this.reconnects += 1;
  }

  dispose(): void {
    this.disposed = true;
  }

  private claimPid(): number {
    const pid = this.nextPid;
    this.nextPid += 1;

    return pid;
  }
}
