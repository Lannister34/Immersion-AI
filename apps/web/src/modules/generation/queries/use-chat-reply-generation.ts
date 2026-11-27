import type { ChatMessageAttachmentDto, ChatSessionDto } from '@immersion/contracts/chats';
import type { ListGenerationJobsResponse, StartChatReplyGenerationJobResponse } from '@immersion/contracts/generation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useReducer } from 'react';
import { chatListQueryKey } from '../../chats/queries/chat-list-query';
import { chatSessionQueryKey } from '../../chats/queries/chat-session-query';
import { appendOptimisticUserMessage } from '../../chats/view-models/optimistic-chat-session';
import { cancelGenerationJob } from '../api/cancel-generation-job';
import { regenerateChatReply } from '../api/regenerate-chat-reply';
import { startChatReplyGenerationJob } from '../api/start-chat-reply-generation-job';
import {
  getLatestGenerationJob,
  isActiveGenerationJob,
  upsertGenerationJob,
} from '../view-models/generation-job-state';
import { EMPTY_STREAMED_REPLY, reduceStreamedReply } from '../view-models/streamed-reply';
import { chatReplyPromptPreviewQueryBaseKey } from './chat-reply-prompt-preview-query';
import { chatGenerationJobsQueryKey, chatGenerationJobsQueryOptions } from './generation-jobs-query';
import { generationReadinessQueryKey } from './generation-readiness-query';
import { useGenerationJobEvents } from './use-generation-job-events';

interface StartChatReplyGenerationMutationVariables {
  attachments: ChatMessageAttachmentDto[];
  message: string;
}

interface StartChatReplyGenerationContext {
  previousSession: ChatSessionDto | undefined;
}

function createOptimisticMessageId() {
  return `optimistic:${
    typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}:${Math.random()}`
  }`;
}

export function useChatReplyGeneration(chatId: string) {
  const queryClient = useQueryClient();
  const [streamed, dispatchStreamed] = useReducer(reduceStreamedReply, EMPTY_STREAMED_REPLY);
  const generationJobsQuery = useQuery(chatGenerationJobsQueryOptions(chatId));
  const latestGenerationJob = getLatestGenerationJob(generationJobsQuery.data?.items);
  const activeGenerationJob = generationJobsQuery.data?.items.find(isActiveGenerationJob);

  useGenerationJobEvents(chatId, activeGenerationJob?.id, {
    onReplyDelta: (delta, channel) => dispatchStreamed({ channel, delta, type: 'delta' }),
    onReplyFinished: () => dispatchStreamed({ type: 'finished' }),
  });

  const applyStartedJob = async (response: StartChatReplyGenerationJobResponse) => {
    queryClient.setQueryData<ListGenerationJobsResponse>(chatGenerationJobsQueryKey(chatId), (current) => ({
      items: upsertGenerationJob(current?.items ?? [], response.job),
    }));
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: chatSessionQueryKey(chatId),
      }),
      queryClient.invalidateQueries({
        queryKey: chatListQueryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: chatReplyPromptPreviewQueryBaseKey(chatId),
      }),
    ]);
  };
  const invalidateAfterJobStartError = async () => {
    await queryClient.invalidateQueries({
      queryKey: chatSessionQueryKey(chatId),
    });
    await queryClient.invalidateQueries({
      queryKey: chatGenerationJobsQueryKey(chatId),
    });
  };

  const startGenerationMutation = useMutation({
    mutationFn: ({ attachments, message }: StartChatReplyGenerationMutationVariables) =>
      startChatReplyGenerationJob({
        ...(attachments.length > 0 ? { attachmentIds: attachments.map((attachment) => attachment.id) } : {}),
        chatId,
        message,
        mode: 'reply',
      }),
    onMutate: async ({ attachments, message }): Promise<StartChatReplyGenerationContext> => {
      await queryClient.cancelQueries({
        queryKey: chatSessionQueryKey(chatId),
      });

      const previousSession = queryClient.getQueryData<ChatSessionDto>(chatSessionQueryKey(chatId));

      if (previousSession) {
        queryClient.setQueryData(
          chatSessionQueryKey(chatId),
          appendOptimisticUserMessage(previousSession, {
            attachments,
            content: message,
            createdAt: new Date().toISOString(),
            id: createOptimisticMessageId(),
          }),
        );
      }

      return { previousSession };
    },
    onError: async (_error, _variables, context) => {
      if (context?.previousSession) {
        queryClient.setQueryData<ChatSessionDto>(chatSessionQueryKey(chatId), context.previousSession);
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: generationReadinessQueryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: chatGenerationJobsQueryKey(chatId),
        }),
      ]);
    },
    onSuccess: applyStartedJob,
  });
  const cancelGenerationMutation = useMutation({
    mutationFn: cancelGenerationJob,
    onSuccess: async (response) => {
      queryClient.setQueryData<ListGenerationJobsResponse>(chatGenerationJobsQueryKey(chatId), (current) => ({
        items: upsertGenerationJob(current?.items ?? [], response.job),
      }));
      await queryClient.invalidateQueries({
        queryKey: chatSessionQueryKey(chatId),
      });
      await queryClient.invalidateQueries({
        queryKey: chatReplyPromptPreviewQueryBaseKey(chatId),
      });
    },
  });
  const continueGenerationMutation = useMutation({
    mutationFn: () =>
      startChatReplyGenerationJob({
        chatId,
        mode: 'continue',
      }),
    onSuccess: applyStartedJob,
    onError: invalidateAfterJobStartError,
  });
  const answerGenerationMutation = useMutation({
    mutationFn: () =>
      startChatReplyGenerationJob({
        chatId,
        mode: 'answer',
      }),
    onSuccess: applyStartedJob,
    onError: invalidateAfterJobStartError,
  });
  const regenerateGenerationMutation = useMutation({
    mutationFn: () => regenerateChatReply({ chatId }),
    onSuccess: applyStartedJob,
    onError: invalidateAfterJobStartError,
  });

  return {
    activeJob: activeGenerationJob,
    streamedReasoning: activeGenerationJob ? streamed.reasoning : '',
    streamedReply: activeGenerationJob ? streamed.reply : '',
    answerLast: () => answerGenerationMutation.mutateAsync(),
    cancel: () => {
      if (activeGenerationJob) {
        cancelGenerationMutation.mutate({
          jobId: activeGenerationJob.id,
        });
      }
    },
    continueLast: () => continueGenerationMutation.mutateAsync(),
    error:
      startGenerationMutation.error ??
      cancelGenerationMutation.error ??
      continueGenerationMutation.error ??
      answerGenerationMutation.error ??
      regenerateGenerationMutation.error,
    isPending:
      startGenerationMutation.isPending ||
      cancelGenerationMutation.isPending ||
      continueGenerationMutation.isPending ||
      answerGenerationMutation.isPending ||
      regenerateGenerationMutation.isPending ||
      Boolean(activeGenerationJob && isActiveGenerationJob(activeGenerationJob)),
    isSendingMessage: startGenerationMutation.isPending,
    latestJob: latestGenerationJob,
    regenerate: () => regenerateGenerationMutation.mutateAsync(),
    start: (message: string, attachments: ChatMessageAttachmentDto[] = []) =>
      startGenerationMutation.mutateAsync({
        attachments,
        message,
      }),
  };
}
