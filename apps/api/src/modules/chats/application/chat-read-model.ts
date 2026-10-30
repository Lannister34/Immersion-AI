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
