import type { ProviderApiKind } from '@immersion/contracts/providers';
import { z } from 'zod';
import { getProviderApiKind, getProviderDefaultModel, isProviderApiKeyRequired } from '../domain/provider-catalog.js';
import { DEFAULT_OPENAI_COMPATIBLE_MODEL } from '../domain/provider-settings.js';
import { runtimeEndpointAdapter } from '../infrastructure/runtime-endpoint-adapter.js';
import { getProviderSettings } from './get-provider-settings.js';
import type { RuntimeEndpointPort } from './runtime-endpoint-port.js';

export class GenerationProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GenerationProviderUnavailableError';
  }
}

export interface GenerationProviderEndpoint {
  apiKey: string | null;
  /** Диалект API: от него зависит и путь, и формат запроса. */
  apiKind: ProviderApiKind;
  baseUrl: string;
  model: string;
}

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/u, '');
}

export function normalizeGenerationProviderBaseUrl(value: string) {
  const trimmed = trimTrailingSlashes(value.trim());

  if (!trimmed) {
    throw new GenerationProviderUnavailableError('Provider URL is empty.');
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Unsupported provider URL protocol.');
    }

    return trimTrailingSlashes(url.toString());
  } catch {
    throw new GenerationProviderUnavailableError(`Provider URL is invalid: ${value}`);
  }
}

/** Базовый URL уже может заканчиваться на /v1 — второй раз его не добавляем. */
function resolveVersionedUrl(baseUrl: string, path: string) {
  const normalized = normalizeGenerationProviderBaseUrl(baseUrl);

  return normalized.endsWith('/v1') ? `${normalized}/${path}` : `${normalized}/v1/${path}`;
}

export function resolveChatCompletionsUrl(endpoint: GenerationProviderEndpoint) {
  return resolveVersionedUrl(endpoint.baseUrl, 'chat/completions');
}

export function resolveAnthropicMessagesUrl(endpoint: GenerationProviderEndpoint) {
  return resolveVersionedUrl(endpoint.baseUrl, 'messages');
}

export async function resolveGenerationProviderEndpoint(
  runtimeEndpointPort: RuntimeEndpointPort = runtimeEndpointAdapter,
): Promise<GenerationProviderEndpoint> {
  const settings = await getProviderSettings();

  if (settings.mode === 'builtin') {
    const runtimeEndpoint = await runtimeEndpointPort.getRunningEndpoint();

    if (!runtimeEndpoint) {
      throw new GenerationProviderUnavailableError('Встроенный сервер не запущен.');
    }

    return {
      apiKey: null,
      apiKind: 'openai-compatible',
      baseUrl: runtimeEndpoint.baseUrl,
      model: runtimeEndpoint.model?.trim() || DEFAULT_OPENAI_COMPATIBLE_MODEL,
    };
  }

  const config = settings.providerConfigs[settings.activeProvider];
  const parsedConfig = z
    .object({
      apiKey: z.string().min(1).optional(),
      model: z.string().min(1).optional(),
      url: z.string().min(1),
    })
    .parse(config);

  const provider = settings.activeProvider;
  const apiKey = parsedConfig.apiKey?.trim() || null;
  // У облачных провайдеров нет ни модели по умолчанию, ни анонимного доступа:
  // молча подставлять «local-model» или уходить без ключа — это гарантированная
  // ошибка провайдера вместо понятного сообщения.
  const model = parsedConfig.model?.trim() || getProviderDefaultModel(provider);

  if (isProviderApiKeyRequired(provider) && !apiKey) {
    throw new GenerationProviderUnavailableError('API-ключ провайдера не задан. Укажите его на странице API.');
  }

  if (!model) {
    throw new GenerationProviderUnavailableError('Модель провайдера не выбрана. Выберите её на странице API.');
  }

  return {
    apiKey,
    apiKind: getProviderApiKind(provider),
    baseUrl: parsedConfig.url,
    model,
  };
}
