import type { CharacterChatStatsRecord } from '../infrastructure/in-memory-chat-index.js';
import { getSharedChatIndex } from './shared-chat-index.js';

export async function getCharacterChatStats(): Promise<ReadonlyMap<string, CharacterChatStatsRecord>> {
  return getSharedChatIndex().getCharacterChatStats();
}
