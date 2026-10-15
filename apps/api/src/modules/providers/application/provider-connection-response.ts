import {
  type ProviderConnectionIssueCode,
  type ProviderConnectionResponse,
  ProviderConnectionResponseSchema,
  type ProviderMode,
  type ProviderModelSummary,
  type ProviderType,
} from '@immersion/contracts/providers';

export interface ConnectionSubject {
  activeProvider: ProviderType;
  mode: ProviderMode;
}

export function createErrorResponse(
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

export function createOkResponse(
  subject: ConnectionSubject,
  endpoint: string,
  models: ProviderModelSummary[],
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
