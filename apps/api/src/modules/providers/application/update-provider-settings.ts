import type { ProviderSettingsSnapshot, UpdateProviderSettingsCommand } from '@immersion/contracts/providers';

import { toProviderSettingsSnapshot } from '../domain/provider-settings-snapshot.js';
import { ProviderSettingsRepository } from './provider-settings-repository.js';

export async function updateProviderSettings(
  command: UpdateProviderSettingsCommand,
  repository = new ProviderSettingsRepository(),
): Promise<ProviderSettingsSnapshot> {
  await repository.write(command);

  return toProviderSettingsSnapshot(await repository.read());
}
