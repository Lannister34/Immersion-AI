import type { ProviderConnectionResponse, ProviderModelsProbeCommand } from '@immersion/contracts/providers';

import type { ProviderSettings } from '../domain/provider-settings-schema.js';
import { readProviderUrlOrigin } from '../domain/provider-url-origin.js';
import { readUsableApiKey } from '../domain/usable-api-key.js';
import type { ProviderModelsFetchDependencies } from './fetch-provider-models.js';
import type { ProviderSettingsRepository } from './provider-settings-repository.js';
import { requestProviderModels } from './request-provider-models.js';

export interface ProbeProviderModelsDependencies extends ProviderModelsFetchDependencies {
  readonly providerSettings: Pick<ProviderSettingsRepository, 'read'>;
}

function findStoredKeyForUrl(settings: ProviderSettings, command: ProviderModelsProbeCommand): string | null {
  const stored = settings.providerConfigs[command.provider];
  const storedKey = readUsableApiKey(stored?.apiKey);

  if (!stored || !storedKey) {
    return null;
  }

  const storedOrigin = readProviderUrlOrigin(stored.url);

  return storedOrigin !== null && storedOrigin === readProviderUrlOrigin(command.url) ? storedKey : null;
}

export async function probeProviderModels(
  command: ProviderModelsProbeCommand,
  dependencies: ProbeProviderModelsDependencies,
): Promise<ProviderConnectionResponse> {
  const apiKey =
    command.apiKey === undefined
      ? findStoredKeyForUrl(dependencies.providerSettings.read(), command)
      : command.apiKey.trim() || null;

  return requestProviderModels({ apiKey, provider: command.provider, url: command.url }, dependencies);
}
