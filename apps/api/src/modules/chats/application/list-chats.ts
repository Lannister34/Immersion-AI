import { type ChatListResponse, ChatListResponseSchema } from '@immersion/contracts/chats';

import { listIndexedChatSummaries } from '../../indexing/index.js';
import type { ChatSummaryRecord } from './chat-records.js';
import { toChatSummaryDto } from './chat-session-response.js';

export interface ListChatsInput {
  searchText?: string;
}

/**
 * Порт к модулю indexing: список чатов отвечает из перестраиваемой read-модели,
 * которая сама освежается по mtime/size канонических файлов перед каждым ответом.
 */
export interface ChatListIndexPort {
  listChatSummaries(options: { searchText?: string }): Promise<ChatSummaryRecord[]>;
}

export async function listChats(input: ListChatsInput = {}, index?: ChatListIndexPort): Promise<ChatListResponse> {
  const chatIndex = index ?? { listChatSummaries: listIndexedChatSummaries };
  const summaries = await chatIndex.listChatSummaries(input.searchText ? { searchText: input.searchText } : {});

  return ChatListResponseSchema.parse({
    items: summaries.map(toChatSummaryDto),
  });
}
