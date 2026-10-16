import { UpdateProviderSettingsCommandSchema } from '@immersion/contracts/providers';

import { toProviderSettingsSnapshot } from '../domain/provider-settings-snapshot.js';
import { ProviderSettingsRepository } from './provider-settings-repository.js';

export async function updateProviderSettings(input: unknown, repository = new ProviderSettingsRepository()) {
  const command = UpdateProviderSettingsCommandSchema.parse(input);

  await repository.write(command);

  return toProviderSettingsSnapshot(await repository.read());
}
