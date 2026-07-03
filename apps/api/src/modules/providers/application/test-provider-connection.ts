import {
  type ProviderConnectionIssueCode,
  type ProviderConnectionResponse,
  ProviderConnectionResponseSchema,
  type ProviderSettingsSnapshot,
} from '@immersion/contracts/providers';
import { z } from 'zod';

import { getRunningRuntimeBaseUrl } from '../../runtime/application/get-running-runtime-base-url.js';
import { normalizeGenerationProviderBaseUrl } from './generation-provider.js';
import { getProviderSettings } from './get-provider-settings.js';

const ProviderModelsPayloadSchema = z
  .object({
    data: z.array(
      z
        .object({
          id: z.string().min(1),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export interface TestProviderConnectionDependencies {
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

function buildModelsEndpoint(baseUrl: string) {
  const normalized = normalizeGenerationProviderBaseUrl(baseUrl);

  return normalized.endsWith('/v1') ? `${normalized}/models` : `${normalized}/v1/models`;
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

function createErrorResponse(
  settings: ProviderSettingsSnapshot,
  code: ProviderConnectionIssueCode,
  message: string,
  endpoint: string | null,
): ProviderConnectionResponse {
  return ProviderConnectionResponseSchema.parse({
    activeProvider: settings.activeProvider,
    endpoint,
    issue: {
      code,
      message,
    },
    mode: settings.mode,
    models: [],
    status: 'error',
  });
}

function createOkResponse(
  settings: ProviderSettingsSnapshot,
  endpoint: string,
  models: Array<{ id: string }>,
): ProviderConnectionResponse {
  return ProviderConnectionResponseSchema.parse({
    activeProvider: settings.activeProvider,
    endpoint,
    issue: null,
    mode: settings.mode,
    models,
    status: 'ok',
  });
}

function buildHeaders(apiKey: string | null) {
  return {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    Accept: 'application/json',
  };
}

async function fetchProviderModels(
  settings: ProviderSettingsSnapshot,
  endpoint: string,
  apiKey: string | null,
  dependencies: TestProviderConnectionDependencies,
) {
  const fetcher = dependencies.fetcher ?? fetch;
  let response: Response;

  try {
    response = await fetcher(endpoint, {
      headers: buildHeaders(apiKey),
      signal: AbortSignal.timeout(dependencies.timeoutMs ?? 5000),
    });
  } catch (error) {
    return createErrorResponse(
      settings,
      'provider_unreachable',
      error instanceof Error ? error.message : 'Provider request failed.',
      endpoint,
    );
  }

  if (!response.ok) {
    return createErrorResponse(settings, 'provider_http_error', `Provider returned HTTP ${response.status}.`, endpoint);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return createErrorResponse(settings, 'provider_invalid_response', 'Provider returned invalid JSON.', endpoint);
  }

  const parsedPayload = ProviderModelsPayloadSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return createErrorResponse(
      settings,
      'provider_invalid_response',
      'Provider models response does not match the OpenAI-compatible contract.',
      endpoint,
    );
  }

  return createOkResponse(
    settings,
    endpoint,
    parsedPayload.data.data.map((model) => ({ id: model.id })),
  );
}

export async function testProviderConnection(
  dependencies: TestProviderConnectionDependencies = {},
): Promise<ProviderConnectionResponse> {
  const settings = await getProviderSettings();

  if (settings.mode === 'builtin') {
    const runtimeBaseUrl = await getRunningRuntimeBaseUrl();

    if (!runtimeBaseUrl) {
      return createErrorResponse(settings, 'builtin_runtime_not_running', 'Встроенный сервер не запущен.', null);
    }

    return fetchProviderModels(settings, buildModelsEndpoint(runtimeBaseUrl), null, dependencies);
  }

  const providerUrl = getConfiguredExternalUrl(settings);

  if (!providerUrl) {
    return createErrorResponse(settings, 'provider_url_missing', 'URL внешнего API не настроен.', null);
  }

  let endpoint: string;

  try {
    endpoint = buildModelsEndpoint(providerUrl);
  } catch {
    return createErrorResponse(
      settings,
      'provider_url_invalid',
      'URL внешнего API должен быть абсолютным HTTP(S)-адресом.',
      null,
    );
  }

  return fetchProviderModels(settings, endpoint, getConfiguredExternalApiKey(settings), dependencies);
}
