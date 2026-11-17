import type { ProviderConnectionResponse } from '@immersion/contracts/providers';

import type { ProviderSettings } from '../domain/provider-settings-schema.js';
import { readUsableApiKey } from '../domain/usable-api-key.js';
import { fetchProviderModels } from './fetch-provider-models.js';
import { resolveVersionedUrl } from './generation-provider.js';
import { type ConnectionSubject, createErrorResponse } from './provider-connection-response.js';
import { requestProviderModels } from './request-provider-models.js';
import type { TestProviderConnectionDependencies } from './test-provider-connection-dependencies.js';

function toSubject(settings: ProviderSettings): ConnectionSubject {
  return { activeProvider: settings.activeProvider, mode: settings.mode };
}

function getConfiguredExternalUrl(settings: ProviderSettings) {
  const config = settings.providerConfigs[settings.activeProvider];
  const url = config?.url;

  return typeof url === 'string' ? url.trim() : '';
}

export async function testProviderConnection(
  dependencies: TestProviderConnectionDependencies,
): Promise<ProviderConnectionResponse> {
  const settings = dependencies.providerSettings.read();
  const subject = toSubject(settings);

  if (settings.mode === 'builtin') {
    const runtimeBaseUrl = (await dependencies.runtimeEndpoint.getRunningEndpoint())?.baseUrl ?? null;

    if (!runtimeBaseUrl) {
      return createErrorResponse(subject, 'builtin_runtime_not_running', 'Встроенный сервер не запущен.', null);
    }

    return fetchProviderModels(
      subject,
      resolveVersionedUrl(runtimeBaseUrl, 'models'),
      'openai-compatible',
      null,
      dependencies,
    );
  }

  const providerUrl = getConfiguredExternalUrl(settings);

  if (!providerUrl) {
    return createErrorResponse(subject, 'provider_url_missing', 'URL внешнего API не настроен.', null);
  }

  return requestProviderModels(
    {
      apiKey: readUsableApiKey(settings.providerConfigs[settings.activeProvider]?.apiKey),
      provider: settings.activeProvider,
      url: providerUrl,
    },
    dependencies,
  );
}
