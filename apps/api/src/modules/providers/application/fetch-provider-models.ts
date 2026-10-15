import type { ProviderApiKind, ProviderConnectionResponse } from '@immersion/contracts/providers';

import { type ConnectionSubject, createErrorResponse, createOkResponse } from './provider-connection-response.js';
import { ProviderModelsPayloadSchema } from './provider-models-payload-schema.js';
import { buildProviderModelsRequestHeaders } from './provider-models-request-headers.js';

export interface ProviderModelsFetchDependencies {
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export async function fetchProviderModels(
  subject: ConnectionSubject,
  endpoint: string,
  apiKind: ProviderApiKind,
  apiKey: string | null,
  dependencies: ProviderModelsFetchDependencies,
): Promise<ProviderConnectionResponse> {
  const fetcher = dependencies.fetcher ?? fetch;
  let response: Response;

  try {
    response = await fetcher(endpoint, {
      headers: buildProviderModelsRequestHeaders(apiKind, apiKey),
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
