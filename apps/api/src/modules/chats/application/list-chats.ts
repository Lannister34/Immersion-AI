import { type ChatListResponse, ChatListResponseSchema } from '@immersion/contracts/chats';

import { toChatSummaryDto } from './chat-session-response.js';
import type { ChatListIndexPort } from './chats-ports.js';

export interface ListChatsInput {
  searchText?: string;
}

export interface ListChatsDependencies {
  readonly chatIndex: ChatListIndexPort;
}

export async function listChats(
  input: ListChatsInput,
  { chatIndex }: ListChatsDependencies,
): Promise<ChatListResponse> {
  const summaries = await chatIndex.listChatSummaries(input.searchText ? { searchText: input.searchText } : {});

  return ChatListResponseSchema.parse({
    items: summaries.map(toChatSummaryDto),
  });
}
