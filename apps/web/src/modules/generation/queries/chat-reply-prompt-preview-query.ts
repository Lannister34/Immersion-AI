import type { ChatReplyPromptPreviewMessageOverride } from '@immersion/contracts/generation';
import { queryOptions } from '@tanstack/react-query';

import { previewChatReplyPrompt } from '../api/preview-chat-reply-prompt';

export const chatReplyPromptPreviewQueryRootKey = ['generation', 'chat-reply-preview'] as const;

export const chatReplyPromptPreviewQueryBaseKey = (chatId: string) =>
  [...chatReplyPromptPreviewQueryRootKey, chatId] as const;

function normalizeOverrides(overrides?: ChatReplyPromptPreviewMessageOverride[]) {
  if (!overrides?.length) {
    return [] as ChatReplyPromptPreviewMessageOverride[];
  }
  return [...overrides]
    .map((override) => ({ ...override, content: override.content }))
    .sort((left, right) => left.messageIndex - right.messageIndex);
}

export const chatReplyPromptPreviewQueryKey = (
  chatId: string,
  draftUserMessage = '',
  overrides?: ChatReplyPromptPreviewMessageOverride[],
) => [...chatReplyPromptPreviewQueryBaseKey(chatId), draftUserMessage.trim(), normalizeOverrides(overrides)] as const;

export function chatReplyPromptPreviewQueryOptions(
  chatId: string,
  draftUserMessage = '',
  overrides?: ChatReplyPromptPreviewMessageOverride[],
) {
  const normalizedDraftUserMessage = draftUserMessage.trim();
  const normalizedOverrides = normalizeOverrides(overrides);

  return queryOptions({
    queryKey: chatReplyPromptPreviewQueryKey(chatId, normalizedDraftUserMessage, normalizedOverrides),
    queryFn: () =>
      previewChatReplyPrompt({
        chatId,
        ...(normalizedDraftUserMessage ? { draftUserMessage: normalizedDraftUserMessage } : {}),
        ...(normalizedOverrides.length > 0 ? { messageOverrides: normalizedOverrides } : {}),
      }),
    // Черновики генерируют много одноразовых ключей — не держим их в кеше дольше 30 секунд.
    gcTime: 30_000,
  });
}
