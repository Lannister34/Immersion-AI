import type { RuntimeOverviewResponse } from '@immersion/contracts/runtime';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

import { chatReplyPromptPreviewQueryRootKey, generationReadinessQueryKey } from '../../generation';
import { applyRuntimeContext } from '../api/apply-runtime-context';
import { runtimeOverviewQueryKey } from '../queries/runtime-overview-query';

export function useApplyRuntimeContext(): UseMutationResult<RuntimeOverviewResponse, Error, number> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contextSize: number) => applyRuntimeContext({ contextSize }),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: runtimeOverviewQueryKey }),
        queryClient.invalidateQueries({ queryKey: generationReadinessQueryKey }),
        queryClient.invalidateQueries({ queryKey: chatReplyPromptPreviewQueryRootKey }),
      ]);
    },
  });
}
