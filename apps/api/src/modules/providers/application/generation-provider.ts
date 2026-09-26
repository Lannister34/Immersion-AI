import type { ProviderApiKind } from '@immersion/contracts/providers';
import { z } from 'zod';
import { getProviderApiKind } from '../domain/provider-catalog.js';
import { findCloudProviderReadinessIssue, resolveProviderModel } from '../domain/provider-readiness.js';
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

export function resolveVersionedUrl(baseUrl: string, path: string): string {
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
  const issue = findCloudProviderReadinessIssue(provider, config);

  if (issue) {
    throw new GenerationProviderUnavailableError(issue.message);
  }

  const model = resolveProviderModel(provider, config);

  if (!model) {
    throw new Error(`Provider ${provider} passed the readiness rule without a model.`);
  }

  return {
    apiKey: parsedConfig.apiKey?.trim() || null,
    apiKind: getProviderApiKind(provider),
    baseUrl: parsedConfig.url,
    model,
  };
}
