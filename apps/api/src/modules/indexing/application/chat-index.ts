import type { ChatSummaryRecord } from '../../chats/index.js';

export interface ChatIndexQueryOptions {
  searchText?: string;
}

export interface CharacterChatStatsRecord {
  chatCount: number;
  lastChatAt: string | null;
}

export interface ChatIndex {
  listChatSummaries(options?: ChatIndexQueryOptions): Promise<ChatSummaryRecord[]>;
  getCharacterChatStats(): Promise<ReadonlyMap<string, CharacterChatStatsRecord>>;
}
