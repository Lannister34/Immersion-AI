import { useMutation, useQueryClient } from '@tanstack/react-query';

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
      await queryClient.invalidateQueries({ queryKey: scenarioListQueryKey });
      await options.onSuccess?.();
    },
  });
}
