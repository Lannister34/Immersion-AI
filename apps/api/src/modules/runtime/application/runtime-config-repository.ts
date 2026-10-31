import type { RuntimeConfigCommand, RuntimeConfigSnapshot } from '@immersion/contracts/runtime';

import {
  readLegacyUserSettingsSource,
  updateLegacyUserSettingsSource,
} from '../../../shared/infrastructure/legacy-settings-source.js';
import { normalizeRuntimeConfig } from './runtime-config.js';

export class RuntimeConfigRepository {
  async read(): Promise<RuntimeConfigSnapshot> {
    const stored = readLegacyUserSettingsSource();

    return normalizeRuntimeConfig(stored.llmServerConfig);
  }

  async merge(patch: RuntimeConfigCommand): Promise<void> {
    await updateLegacyUserSettingsSource((existing) => ({
      ...existing,
      llmServerConfig: { ...normalizeRuntimeConfig(existing.llmServerConfig), ...patch },
    }));
  }
}
