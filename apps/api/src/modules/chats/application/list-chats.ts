import { type ChatListResponse, ChatListResponseSchema } from '@immersion/contracts/chats';

import { FileChatRepository } from '../infrastructure/file-chat-repository.js';
import { toChatSummaryDto } from './chat-session-response.js';

export interface ListChatsInput {
  searchText?: string;
}

export async function listChats(input: ListChatsInput = {}): Promise<ChatListResponse> {
  const chatRepository = new FileChatRepository();
  const summaries = await chatRepository.listGenericChats(input.searchText ? { searchText: input.searchText } : {});

  return ChatListResponseSchema.parse({
    items: summaries.map(toChatSummaryDto),
  });
}
