import type { ProviderApiKind } from '@immersion/contracts/providers';

import { buildAnthropicAuthHeaders } from '../domain/anthropic-auth-headers.js';

export type ProviderModelsRequestHeaders = {
  Accept: string;
  Authorization?: string;
  'anthropic-version'?: string;
  'x-api-key'?: string;
};

export function buildProviderModelsRequestHeaders(
  apiKind: ProviderApiKind,
  apiKey: string | null,
): ProviderModelsRequestHeaders {
  if (apiKind === 'anthropic') {
    return {
      ...buildAnthropicAuthHeaders(apiKey),
      Accept: 'application/json',
    };
  }

  return {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    Accept: 'application/json',
  };
}
