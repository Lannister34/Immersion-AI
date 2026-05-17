import { type ChatListResponse, ChatListResponseSchema } from '@immersion/contracts/chats';

import { FileChatRepository } from '../infrastructure/file-chat-repository.js';

export interface ListChatsInput {
  searchText?: string;
}

export async function listChats(input: ListChatsInput = {}): Promise<ChatListResponse> {
  const chatRepository = new FileChatRepository();

  return ChatListResponseSchema.parse({
    items: await chatRepository.listGenericChats(input.searchText ? { searchText: input.searchText } : {}),
  });
}
