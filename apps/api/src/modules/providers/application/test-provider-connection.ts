import type { ProviderConnectionResponse, ProviderSettingsSnapshot } from '@immersion/contracts/providers';

import { runtimeEndpointAdapter } from '../infrastructure/runtime-endpoint-adapter.js';
import { fetchProviderModels } from './fetch-provider-models.js';
import { resolveVersionedUrl } from './generation-provider.js';
import { getProviderSettings } from './get-provider-settings.js';
import { probeProviderModels } from './probe-provider-models.js';
import { type ConnectionSubject, createErrorResponse } from './provider-connection-response.js';
import type { TestProviderConnectionDependencies } from './test-provider-connection-dependencies.js';

function toSubject(settings: ProviderSettingsSnapshot): ConnectionSubject {
  return { activeProvider: settings.activeProvider, mode: settings.mode };
}

function getConfiguredExternalUrl(settings: ProviderSettingsSnapshot) {
  const config = settings.providerConfigs[settings.activeProvider];
  const url = config?.url;

  return typeof url === 'string' ? url.trim() : '';
}

function getConfiguredExternalApiKey(settings: ProviderSettingsSnapshot) {
  const config = settings.providerConfigs[settings.activeProvider];
  const apiKey = config?.apiKey;

  return typeof apiKey === 'string' && apiKey.trim().length > 0 ? apiKey.trim() : null;
}

export async function testProviderConnection(
  dependencies: TestProviderConnectionDependencies,
): Promise<ProviderConnectionResponse> {
  const settings = await getProviderSettings();
  const subject = toSubject(settings);

  if (settings.mode === 'builtin') {
    const runtimeEndpointPort = dependencies.runtimeEndpointPort ?? runtimeEndpointAdapter;
    const runtimeBaseUrl = (await runtimeEndpointPort.getRunningEndpoint())?.baseUrl ?? null;

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

  const apiKey = getConfiguredExternalApiKey(settings);

  return probeProviderModels(
    {
      provider: settings.activeProvider,
      url: providerUrl,
      ...(apiKey ? { apiKey } : {}),
    },
    dependencies,
  );
}
