import type {
  ChatReplyPromptPreviewMessageOverride,
  ChatReplyPromptPreviewResponse,
} from '@immersion/contracts/generation';
import { type Query, queryOptions } from '@tanstack/react-query';

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

type ChatReplyPromptPreviewQueryKey = ReturnType<typeof chatReplyPromptPreviewQueryKey>;

function keepPreviousEstimateUnlessDraftLess(
  previousData: ChatReplyPromptPreviewResponse | undefined,
  previousQuery:
    | Query<ChatReplyPromptPreviewResponse, Error, ChatReplyPromptPreviewResponse, ChatReplyPromptPreviewQueryKey>
    | undefined,
): ChatReplyPromptPreviewResponse | undefined {
  if (!previousQuery) {
    return undefined;
  }
  const [, , , draftUserMessage, overrides] = previousQuery.queryKey;
  return draftUserMessage === '' && overrides.length === 0 ? undefined : previousData;
}

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
    gcTime: 30_000,
    placeholderData: keepPreviousEstimateUnlessDraftLess,
  });
}
