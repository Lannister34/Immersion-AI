import type { RuntimeConfigCommand, RuntimeConfigSnapshot } from '@immersion/contracts/runtime';

import type { UserSettingsDocument } from '../../settings/index.js';
import { normalizeRuntimeConfig } from './runtime-config.js';
import type { RuntimeProcess } from './runtime-process.js';

export interface RuntimeConfigRepositoryOptions {
  readonly document: UserSettingsDocument;
  readonly runtimeProcess: Pick<RuntimeProcess, 'getEngineInfo' | 'getState'>;
}

export class RuntimeConfigRepository {
  private readonly document: UserSettingsDocument;
  private readonly runtimeProcess: Pick<RuntimeProcess, 'getEngineInfo' | 'getState'>;

  constructor({ document, runtimeProcess }: RuntimeConfigRepositoryOptions) {
    this.document = document;
    this.runtimeProcess = runtimeProcess;
  }

  read(): RuntimeConfigSnapshot {
    return this.normalize(this.document.read().llmServerConfig);
  }

  async merge(patch: RuntimeConfigCommand): Promise<void> {
    await this.document.update((existing) => ({
      ...existing,
      llmServerConfig: { ...this.normalize(existing.llmServerConfig), ...patch },
    }));
  }

  private normalize(raw: unknown): RuntimeConfigSnapshot {
    return normalizeRuntimeConfig(raw, {
      modelsDir: this.runtimeProcess.getEngineInfo().defaultModelsDir,
      port: this.runtimeProcess.getState().port,
    });
  }
}
