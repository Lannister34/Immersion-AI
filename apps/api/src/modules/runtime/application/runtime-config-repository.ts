import type { RuntimeConfigCommand } from '@immersion/contracts/runtime';

import {
  readLegacyUserSettingsSource,
  updateLegacyUserSettingsSource,
} from '../../../shared/infrastructure/legacy-settings-source.js';
import { normalizeRuntimeConfig } from './runtime-config.js';

export class RuntimeConfigRepository {
  async read() {
    const stored = readLegacyUserSettingsSource();

    return normalizeRuntimeConfig(stored.llmServerConfig);
  }

  async write(next: RuntimeConfigCommand) {
    await updateLegacyUserSettingsSource((existing) => ({
      ...existing,
      llmServerConfig: next,
    }));
  }
}
