import { FileChatRepository } from '../infrastructure/file-chat-repository.js';
import type { ChatSummaryRecord } from './chat-records.js';

export interface ChatFileStatRecord {
  chatId: string;
  fileMtimeMs: number;
  fileSize: number;
}

export interface ChatSearchTextRecord {
  characterNameLower: string | null;
  messageTextsLower: string[];
  titleLower: string;
}

export interface ChatSummaryWithSearchText {
  searchText: ChatSearchTextRecord;
  summary: ChatSummaryRecord;
}

export async function listChatFileStats(): Promise<ChatFileStatRecord[]> {
  return new FileChatRepository().listChatFileStats();
}

export async function readChatSummaryWithSearchText(chatId: string): Promise<ChatSummaryWithSearchText | null> {
  return new FileChatRepository().readChatSummaryWithSearchText(chatId);
}
