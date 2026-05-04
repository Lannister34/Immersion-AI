import { PlaceholderScreen } from '../../shared/ui/placeholder-screen';

export { cancelGenerationJob } from './api/cancel-generation-job';
export { generateChatReply } from './api/generate-chat-reply';
export { previewChatReplyPrompt } from './api/preview-chat-reply-prompt';
export { regenerateChatReply } from './api/regenerate-chat-reply';
export { startChatReplyGenerationJob } from './api/start-chat-reply-generation-job';
export { ChatReplyPromptPreviewPanel } from './components/chat-reply-prompt-preview-panel';
export {
  chatReplyPromptPreviewQueryBaseKey,
  chatReplyPromptPreviewQueryKey,
  chatReplyPromptPreviewQueryOptions,
} from './queries/chat-reply-prompt-preview-query';
export {
  chatGenerationJobsQueryKey,
  chatGenerationJobsQueryOptions,
  generationJobsQueryKey,
} from './queries/generation-jobs-query';
export {
  generationReadinessQueryKey,
  generationReadinessQueryOptions,
} from './queries/generation-readiness-query';
export { useChatReplyGeneration } from './queries/use-chat-reply-generation';
export { useGenerationJobEvents } from './queries/use-generation-job-events';
export { toGenerationAvailabilityViewModel } from './view-models/generation-availability';
export {
  getLatestGenerationJob,
  isActiveGenerationJob,
  upsertGenerationJob,
} from './view-models/generation-job-state';

export function GenerationPanel() {
  return (
    <PlaceholderScreen
      eyebrow="генерация"
      title="Стриминг и управление генерацией"
      description="Здесь будет только UI orchestration вокруг streaming, cancel и invalidate/refetch, без прямой записи chat state."
    />
  );
}
