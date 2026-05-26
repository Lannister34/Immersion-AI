import type {
  CreateSamplerPresetCommand,
  SamplerPresetMutationResponse,
  SettingsOverviewResponse,
  UpdateSamplerPresetCommand,
} from '@immersion/contracts/settings';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createSamplerPreset,
  deleteSamplerPreset,
  setActiveSamplerPreset,
  updateSamplerPreset,
} from '../api/sampler-preset';
import { settingsOverviewQueryKey } from '../queries/settings-overview-query';

function patchOverviewSampler(
  queryClient: ReturnType<typeof useQueryClient>,
  sampler: SettingsOverviewResponse['sampler'],
) {
  const cached = queryClient.getQueryData<SettingsOverviewResponse>(settingsOverviewQueryKey);
  if (cached) {
    queryClient.setQueryData<SettingsOverviewResponse>(settingsOverviewQueryKey, { ...cached, sampler });
  }
}

export function useCreateSamplerPreset(
  options: { onSuccess?: (response: SamplerPresetMutationResponse) => void } = {},
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (command: CreateSamplerPresetCommand) => createSamplerPreset(command),
    onSuccess: async (response) => {
      patchOverviewSampler(queryClient, response.sampler);
      await queryClient.invalidateQueries({ queryKey: settingsOverviewQueryKey });
      options.onSuccess?.(response);
    },
  });
}

interface UpdateSamplerPresetVariables {
  presetId: string;
  command: UpdateSamplerPresetCommand;
}

export function useUpdateSamplerPreset(
  options: { onSuccess?: (response: SamplerPresetMutationResponse) => void } = {},
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ presetId, command }: UpdateSamplerPresetVariables) => updateSamplerPreset(presetId, command),
    onSuccess: async (response) => {
      patchOverviewSampler(queryClient, response.sampler);
      await queryClient.invalidateQueries({ queryKey: settingsOverviewQueryKey });
      options.onSuccess?.(response);
    },
  });
}

export function useDeleteSamplerPreset(options: { onSuccess?: () => void } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (presetId: string) => deleteSamplerPreset(presetId),
    onSuccess: async (response) => {
      patchOverviewSampler(queryClient, response.sampler);
      await queryClient.invalidateQueries({ queryKey: settingsOverviewQueryKey });
      options.onSuccess?.();
    },
  });
}

export function useSetActiveSamplerPreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (presetId: string) => setActiveSamplerPreset({ presetId }),
    onSuccess: async (response) => {
      patchOverviewSampler(queryClient, response.sampler);
      await queryClient.invalidateQueries({ queryKey: settingsOverviewQueryKey });
    },
  });
}
