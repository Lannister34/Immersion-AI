export const indexingModuleId = 'indexing' as const;

export { getCharacterChatStats } from './application/get-character-chat-stats.js';
export { listIndexedChatSummaries } from './application/list-indexed-chat-summaries.js';
export type {
  CharacterChatStatsRecord,
  ChatIndexQueryOptions,
  ChatIndexSourcePort,
} from './infrastructure/in-memory-chat-index.js';
