import {
  type ModelBindingMutationResponse,
  ModelBindingMutationResponseSchema,
  type UpsertModelBindingCommand,
  UpsertModelBindingCommandSchema,
} from '@immersion/contracts/settings';

import { apiDelete, apiPut } from '../../../shared/api/client';

export function upsertModelBinding(
  modelName: string,
  command: UpsertModelBindingCommand,
): Promise<ModelBindingMutationResponse> {
  return apiPut(
    `/api/settings/sampler/bindings/${encodeURIComponent(modelName)}`,
    command,
    UpsertModelBindingCommandSchema,
    ModelBindingMutationResponseSchema,
  );
}

export function deleteModelBinding(modelName: string): Promise<ModelBindingMutationResponse> {
  return apiDelete(
    `/api/settings/sampler/bindings/${encodeURIComponent(modelName)}`,
    ModelBindingMutationResponseSchema,
  );
}
