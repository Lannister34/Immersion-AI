import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { GenerationJobDto, ListGenerationJobsResponse } from '@immersion/contracts/generation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { chatListQueryKey } from '../../chats/queries/chat-list-query';
import { chatSessionQueryKey } from '../../chats/queries/chat-session-query';
import { openGenerationJobEventSource, parseGenerationJobEvent } from '../api/watch-generation-job';
import { isActiveGenerationJob, upsertGenerationJob } from '../view-models/generation-job-state';
import { chatReplyPromptPreviewQueryBaseKey } from './chat-reply-prompt-preview-query';
import { chatGenerationJobsQueryKey } from './generation-jobs-query';

export function useGenerationJobEvents(chatId: string, jobId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!jobId) {
      return;
    }

    const eventSource = openGenerationJobEventSource(jobId);
    const updateJobCache = (job: GenerationJobDto) => {
      queryClient.setQueryData<ListGenerationJobsResponse>(chatGenerationJobsQueryKey(chatId), (current) => ({
        items: upsertGenerationJob(current?.items ?? [], job),
      }));

      if (!isActiveGenerationJob(job)) {
        void queryClient.invalidateQueries({
          queryKey: chatListQueryKey,
        });
        void queryClient.invalidateQueries({
          queryKey: chatSessionQueryKey(chatId),
        });
      }
    };
    const handleJobEvent = (message: MessageEvent) => {
      const event = parseGenerationJobEvent(message);

      updateJobCache(event.job);
    };
    const handleSessionEvent = (message: MessageEvent) => {
      const event = parseGenerationJobEvent(message);

      updateJobCache(event.job);
      if (event.type === 'chat.session.updated') {
        queryClient.setQueryData<ChatSessionDto>(chatSessionQueryKey(chatId), event.session);
        void queryClient.invalidateQueries({
          queryKey: chatReplyPromptPreviewQueryBaseKey(chatId),
        });
      }
    };

    eventSource.addEventListener('generation.job.snapshot', handleJobEvent);
    eventSource.addEventListener('generation.job.updated', handleJobEvent);
    eventSource.addEventListener('chat.session.updated', handleSessionEvent);
    eventSource.onerror = () => {
      void queryClient.invalidateQueries({
        queryKey: chatGenerationJobsQueryKey(chatId),
      });
    };

    return () => {
      eventSource.close();
    };
  }, [chatId, jobId, queryClient]);
}
