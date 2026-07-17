import { useMutation, useQueryClient } from '@tanstack/react-query';

import { chatListQueryKey } from '../../chats/queries/chat-list-query';
import { deleteScenario } from '../api/delete-scenario';
import { scenarioDetailQueryKey } from '../queries/scenario-detail-query';
import { scenarioListQueryKey } from '../queries/scenario-list-query';

interface UseDeleteScenarioOptions {
  onSuccess?: () => void | Promise<void>;
}

export function useDeleteScenario(scenarioId: string, options: UseDeleteScenarioOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteScenario(scenarioId),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: scenarioDetailQueryKey(scenarioId) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: scenarioListQueryKey }),
        // Сводки чатов содержат имя сценария — иначе оно остаётся в списке после удаления.
        queryClient.invalidateQueries({ queryKey: chatListQueryKey }),
      ]);
      await options.onSuccess?.();
    },
  });
}
