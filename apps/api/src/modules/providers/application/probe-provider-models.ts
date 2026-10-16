import type { ProviderConnectionResponse, ProviderModelsProbeCommand } from '@immersion/contracts/providers';

import { getProviderApiKind, isProviderApiKeyRequired } from '../domain/provider-catalog.js';
import { fetchProviderModels } from './fetch-provider-models.js';
import { resolveVersionedUrl } from './generation-provider.js';
import { type ConnectionSubject, createErrorResponse } from './provider-connection-response.js';
import type { TestProviderConnectionDependencies } from './test-provider-connection-dependencies.js';

export async function probeProviderModels(
  command: ProviderModelsProbeCommand,
  dependencies: TestProviderConnectionDependencies = {},
): Promise<ProviderConnectionResponse> {
  const subject: ConnectionSubject = { activeProvider: command.provider, mode: 'external' };
  const apiKey = command.apiKey?.trim() || null;
  let endpoint: string;

  try {
    endpoint = resolveVersionedUrl(command.url, 'models');
  } catch {
    return createErrorResponse(
      subject,
      'provider_url_invalid',
      'URL внешнего API должен быть абсолютным HTTP(S)-адресом.',
      null,
    );
  }

  if (!apiKey && isProviderApiKeyRequired(command.provider)) {
    return createErrorResponse(
      subject,
      'provider_api_key_missing',
      'API-ключ провайдера не задан — список моделей запросить не у кого.',
      endpoint,
    );
  }

  return fetchProviderModels(subject, endpoint, getProviderApiKind(command.provider), apiKey, dependencies);
}
