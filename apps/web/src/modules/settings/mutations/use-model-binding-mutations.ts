import type { ModelBindingMutationResponse, SettingsOverviewResponse } from '@immersion/contracts/settings';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteModelBinding, upsertModelBinding } from '../api/model-binding';
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

interface UpsertModelBindingVariables {
  modelName: string;
  presetId: string;
}

export function useUpsertModelBinding(options: { onSuccess?: (response: ModelBindingMutationResponse) => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ modelName, presetId }: UpsertModelBindingVariables) => upsertModelBinding(modelName, { presetId }),
    onSuccess: async (response) => {
      patchOverviewSampler(queryClient, response.sampler);
      await queryClient.invalidateQueries({ queryKey: settingsOverviewQueryKey });
      options.onSuccess?.(response);
    },
  });
}

export function useDeleteModelBinding(options: { onSuccess?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (modelName: string) => deleteModelBinding(modelName),
    onSuccess: async (response) => {
      patchOverviewSampler(queryClient, response.sampler);
      await queryClient.invalidateQueries({ queryKey: settingsOverviewQueryKey });
      options.onSuccess?.();
    },
  });
}
