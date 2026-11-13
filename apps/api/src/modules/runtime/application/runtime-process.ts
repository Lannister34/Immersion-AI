import type { RuntimeConfigSnapshot, RuntimeEngineInfo, RuntimeStatusSnapshot } from '@immersion/contracts/runtime';

export interface RuntimeStartConfig extends Omit<RuntimeConfigSnapshot, 'modelsDirs'> {
  mmprojPath?: string | undefined;
  modelPath: string;
}

export interface RuntimeProcess {
  getState(): RuntimeStatusSnapshot;
  getEngineInfo(): RuntimeEngineInfo;
  getVisionProjectorPath(): string | null;
  getLogs(): string[];
  start(config: RuntimeStartConfig): Promise<void>;
  stop(): Promise<void>;
  reconnect(): Promise<void>;
  dispose(): void;
}
