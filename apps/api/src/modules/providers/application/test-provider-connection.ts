import {
  type ProviderApiKind,
  type ProviderConnectionIssueCode,
  type ProviderConnectionResponse,
  ProviderConnectionResponseSchema,
  type ProviderMode,
  type ProviderModelsProbeCommand,
  type ProviderSettingsSnapshot,
  type ProviderType,
} from '@immersion/contracts/providers';
import { z } from 'zod';

import { getProviderApiKind, isProviderApiKeyRequired } from '../domain/provider-catalog.js';
import { runtimeEndpointAdapter } from '../infrastructure/runtime-endpoint-adapter.js';
import { normalizeGenerationProviderBaseUrl } from './generation-provider.js';
import { getProviderSettings } from './get-provider-settings.js';
import type { RuntimeEndpointPort } from './runtime-endpoint-port.js';

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
  runtimeEndpointPort?: RuntimeEndpointPort;
  timeoutMs?: number;
}

interface ConnectionSubject {
  activeProvider: ProviderType;
  mode: ProviderMode;
}

function buildModelsEndpoint(baseUrl: string) {
  const normalized = normalizeGenerationProviderBaseUrl(baseUrl);

  return normalized.endsWith('/v1') ? `${normalized}/models` : `${normalized}/v1/models`;
}

function buildHeaders(apiKind: ProviderApiKind, apiKey: string | null) {
  if (apiKind === 'anthropic') {
    return {
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
      'anthropic-version': '2023-06-01',
      Accept: 'application/json',
    };
  }

  return {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    Accept: 'application/json',
  };
}

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

function createErrorResponse(
  subject: ConnectionSubject,
  code: ProviderConnectionIssueCode,
  message: string,
  endpoint: string | null,
): ProviderConnectionResponse {
  return ProviderConnectionResponseSchema.parse({
    activeProvider: subject.activeProvider,
    endpoint,
    issue: {
      code,
      message,
    },
    mode: subject.mode,
    models: [],
    status: 'error',
  });
}

function createOkResponse(
  subject: ConnectionSubject,
  endpoint: string,
  models: Array<{ id: string }>,
): ProviderConnectionResponse {
  return ProviderConnectionResponseSchema.parse({
    activeProvider: subject.activeProvider,
    endpoint,
    issue: null,
    mode: subject.mode,
    models,
    status: 'ok',
  });
}

async function fetchProviderModels(
  subject: ConnectionSubject,
  endpoint: string,
  apiKind: ProviderApiKind,
  apiKey: string | null,
  dependencies: TestProviderConnectionDependencies,
) {
  const fetcher = dependencies.fetcher ?? fetch;
  let response: Response;

  try {
    response = await fetcher(endpoint, {
      headers: buildHeaders(apiKind, apiKey),
      signal: AbortSignal.timeout(dependencies.timeoutMs ?? 5000),
    });
  } catch (error) {
    return createErrorResponse(
      subject,
      'provider_unreachable',
      error instanceof Error ? error.message : 'Provider request failed.',
      endpoint,
    );
  }

  if (!response.ok) {
    return createErrorResponse(subject, 'provider_http_error', `Provider returned HTTP ${response.status}.`, endpoint);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return createErrorResponse(subject, 'provider_invalid_response', 'Provider returned invalid JSON.', endpoint);
  }

  const parsedPayload = ProviderModelsPayloadSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return createErrorResponse(
      subject,
      'provider_invalid_response',
      'Provider models response does not match the OpenAI-compatible contract.',
      endpoint,
    );
  }

  return createOkResponse(
    subject,
    endpoint,
    parsedPayload.data.data.map((model) => ({ id: model.id })),
  );
}

export async function probeProviderModels(
  command: ProviderModelsProbeCommand,
  dependencies: TestProviderConnectionDependencies = {},
): Promise<ProviderConnectionResponse> {
  const subject: ConnectionSubject = { activeProvider: command.provider, mode: 'external' };
  const apiKey = command.apiKey?.trim() || null;
  let endpoint: string;

  try {
    endpoint = buildModelsEndpoint(command.url);
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

export async function testProviderConnection(
  dependencies: TestProviderConnectionDependencies = {},
): Promise<ProviderConnectionResponse> {
  const settings = await getProviderSettings();
  const subject = toSubject(settings);

  if (settings.mode === 'builtin') {
    const runtimeEndpointPort = dependencies.runtimeEndpointPort ?? runtimeEndpointAdapter;
    const runtimeBaseUrl = (await runtimeEndpointPort.getRunningEndpoint())?.baseUrl ?? null;

    if (!runtimeBaseUrl) {
      return createErrorResponse(subject, 'builtin_runtime_not_running', 'Встроенный сервер не запущен.', null);
    }

    return fetchProviderModels(subject, buildModelsEndpoint(runtimeBaseUrl), 'openai-compatible', null, dependencies);
  }

  const providerUrl = getConfiguredExternalUrl(settings);

  if (!providerUrl) {
    return createErrorResponse(subject, 'provider_url_missing', 'URL внешнего API не настроен.', null);
  }

  return probeProviderModels(
    {
      provider: settings.activeProvider,
      url: providerUrl,
      ...(getConfiguredExternalApiKey(settings) ? { apiKey: getConfiguredExternalApiKey(settings) ?? '' } : {}),
    },
    dependencies,
  );
}
