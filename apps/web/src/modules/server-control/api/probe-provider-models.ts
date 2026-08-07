import {
  ProviderConnectionResponseSchema,
  type ProviderModelsProbeCommand,
  ProviderModelsProbeCommandSchema,
} from '@immersion/contracts/providers';

import { apiPost } from '../../../shared/api/client';

export function probeProviderModels(command: ProviderModelsProbeCommand) {
  return apiPost('/api/providers/models', command, ProviderModelsProbeCommandSchema, ProviderConnectionResponseSchema);
}
