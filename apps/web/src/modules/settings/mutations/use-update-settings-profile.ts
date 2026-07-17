import type { SettingsOverviewResponse, UpdateSettingsProfileResponse } from '@immersion/contracts/settings';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { chatReplyPromptPreviewQueryRootKey } from '../../generation';
import { updateSettingsProfile } from '../api/update-settings-profile';
import { settingsOverviewQueryKey } from '../queries/settings-overview-query';

interface UseUpdateSettingsProfileOptions {
  onSuccess?: (response: UpdateSettingsProfileResponse) => void | Promise<void>;
}

export function useUpdateSettingsProfile(options: UseUpdateSettingsProfileOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateSettingsProfile,
    onSuccess: async (response) => {
      const cached = queryClient.getQueryData<SettingsOverviewResponse>(settingsOverviewQueryKey);
      if (cached) {
        queryClient.setQueryData<SettingsOverviewResponse>(settingsOverviewQueryKey, {
          ...cached,
          profile: response.profile,
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: settingsOverviewQueryKey }),
        // Имя, persona и шаблон system prompt входят в prompt — превью нужно пересчитать.
        queryClient.invalidateQueries({ queryKey: chatReplyPromptPreviewQueryRootKey }),
      ]);
      await options.onSuccess?.(response);
    },
  });
}
