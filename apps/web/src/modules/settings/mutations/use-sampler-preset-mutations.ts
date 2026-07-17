import type {
  CreateSamplerPresetCommand,
  SamplerPresetMutationResponse,
  SettingsOverviewResponse,
  UpdateSamplerPresetCommand,
} from '@immersion/contracts/settings';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { chatReplyPromptPreviewQueryRootKey } from '../../generation';
import {
  createSamplerPreset,
  deleteSamplerPreset,
  setActiveSamplerPreset,
  updateSamplerPreset,
} from '../api/sampler-preset';
import { settingsOverviewQueryKey } from '../queries/settings-overview-query';

async function applySamplerUpdate(
  queryClient: ReturnType<typeof useQueryClient>,
  sampler: SettingsOverviewResponse['sampler'],
) {
  const cached = queryClient.getQueryData<SettingsOverviewResponse>(settingsOverviewQueryKey);
  if (cached) {
    queryClient.setQueryData<SettingsOverviewResponse>(settingsOverviewQueryKey, { ...cached, sampler });
  }
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: settingsOverviewQueryKey }),
    // Preset влияет на эффективные настройки генерации — превью контекста нужно пересчитать.
    queryClient.invalidateQueries({ queryKey: chatReplyPromptPreviewQueryRootKey }),
  ]);
}

export function useCreateSamplerPreset(
  options: { onSuccess?: (response: SamplerPresetMutationResponse) => void } = {},
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (command: CreateSamplerPresetCommand) => createSamplerPreset(command),
    onSuccess: async (response) => {
      await applySamplerUpdate(queryClient, response.sampler);
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
      await applySamplerUpdate(queryClient, response.sampler);
      options.onSuccess?.(response);
    },
  });
}

export function useDeleteSamplerPreset(options: { onSuccess?: () => void } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (presetId: string) => deleteSamplerPreset(presetId),
    onSuccess: async (response) => {
      await applySamplerUpdate(queryClient, response.sampler);
      options.onSuccess?.();
    },
  });
}

export function useSetActiveSamplerPreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (presetId: string) => setActiveSamplerPreset({ presetId }),
    onSuccess: async (response) => {
      await applySamplerUpdate(queryClient, response.sampler);
    },
  });
}
