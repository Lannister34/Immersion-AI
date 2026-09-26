const ANTHROPIC_API_VERSION = '2023-06-01';

export interface AnthropicAuthHeaders {
  'anthropic-version': string;
  'x-api-key'?: string;
}

export function buildAnthropicAuthHeaders(apiKey: string | null): AnthropicAuthHeaders {
  return {
    ...(apiKey ? { 'x-api-key': apiKey } : {}),
    'anthropic-version': ANTHROPIC_API_VERSION,
  };
}
