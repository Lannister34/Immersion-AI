import {
  type CreateSamplerPresetCommand,
  CreateSamplerPresetCommandSchema,
  type DeleteSamplerPresetResponse,
  DeleteSamplerPresetResponseSchema,
  type SamplerPresetMutationResponse,
  SamplerPresetMutationResponseSchema,
  type SetActiveSamplerPresetCommand,
  SetActiveSamplerPresetCommandSchema,
  type SetActiveSamplerPresetResponse,
  SetActiveSamplerPresetResponseSchema,
  type UpdateSamplerPresetCommand,
  UpdateSamplerPresetCommandSchema,
} from '@immersion/contracts/settings';

import { apiDelete, apiPost, apiPut } from '../../../shared/api/client';

export function createSamplerPreset(command: CreateSamplerPresetCommand): Promise<SamplerPresetMutationResponse> {
  return apiPost(
    '/api/settings/sampler/presets',
    command,
    CreateSamplerPresetCommandSchema,
    SamplerPresetMutationResponseSchema,
  );
}

export function updateSamplerPreset(
  presetId: string,
  command: UpdateSamplerPresetCommand,
): Promise<SamplerPresetMutationResponse> {
  return apiPut(
    `/api/settings/sampler/presets/${encodeURIComponent(presetId)}`,
    command,
    UpdateSamplerPresetCommandSchema,
    SamplerPresetMutationResponseSchema,
  );
}

export function deleteSamplerPreset(presetId: string): Promise<DeleteSamplerPresetResponse> {
  return apiDelete(`/api/settings/sampler/presets/${encodeURIComponent(presetId)}`, DeleteSamplerPresetResponseSchema);
}

export function setActiveSamplerPreset(
  command: SetActiveSamplerPresetCommand,
): Promise<SetActiveSamplerPresetResponse> {
  return apiPut(
    '/api/settings/sampler/active-preset',
    command,
    SetActiveSamplerPresetCommandSchema,
    SetActiveSamplerPresetResponseSchema,
  );
}
