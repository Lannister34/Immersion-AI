import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { GenerationJobDto, ListGenerationJobsResponse } from '@immersion/contracts/generation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { chatListQueryKey } from '../../chats/queries/chat-list-query';
import { chatSessionQueryKey } from '../../chats/queries/chat-session-query';
import { openGenerationJobEventSource, parseGenerationJobEvent } from '../api/watch-generation-job';
import { isActiveGenerationJob, upsertGenerationJob } from '../view-models/generation-job-state';
import { chatReplyPromptPreviewQueryBaseKey } from './chat-reply-prompt-preview-query';
import { chatGenerationJobsQueryKey } from './generation-jobs-query';

export interface GenerationJobEventHandlers {
  /** Кусок ответа модели при включённом стриминге. */
  onReplyDelta?: (delta: string) => void;
  /** Ответ дописан или задача завершилась: живой буфер больше не нужен. */
  onReplyFinished?: () => void;
}

export function useGenerationJobEvents(
  chatId: string,
  jobId: string | undefined,
  handlers: GenerationJobEventHandlers = {},
) {
  const queryClient = useQueryClient();
  // Колбэки держим в ref: пересоздавать подписку на каждый рендер нельзя,
  // иначе поток обрывался бы после первого же куска.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

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
        handlersRef.current.onReplyFinished?.();
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
    const handleDeltaEvent = (message: MessageEvent) => {
      const event = parseGenerationJobEvent(message);

      if (event.type === 'chat.reply.delta') {
        handlersRef.current.onReplyDelta?.(event.delta);
      }
    };
    const handleSessionEvent = (message: MessageEvent) => {
      const event = parseGenerationJobEvent(message);

      updateJobCache(event.job);
      if (event.type === 'chat.session.updated') {
        handlersRef.current.onReplyFinished?.();
        queryClient.setQueryData<ChatSessionDto>(chatSessionQueryKey(chatId), event.session);
        void queryClient.invalidateQueries({
          queryKey: chatReplyPromptPreviewQueryBaseKey(chatId),
        });
      }
    };

    eventSource.addEventListener('chat.reply.delta', handleDeltaEvent);
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
