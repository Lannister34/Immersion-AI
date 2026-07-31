import { z } from 'zod';
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

export function resolveChatCompletionsUrl(endpoint: GenerationProviderEndpoint) {
  const normalized = normalizeGenerationProviderBaseUrl(endpoint.baseUrl);

  return normalized.endsWith('/v1') ? `${normalized}/chat/completions` : `${normalized}/v1/chat/completions`;
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

  return {
    apiKey: parsedConfig.apiKey ?? null,
    baseUrl: parsedConfig.url,
    model: parsedConfig.model?.trim() || DEFAULT_OPENAI_COMPATIBLE_MODEL,
  };
}
