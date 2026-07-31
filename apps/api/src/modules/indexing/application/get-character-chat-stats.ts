import type { CharacterChatStatsRecord } from '../infrastructure/in-memory-chat-index.js';
import { getSharedChatIndex } from './shared-chat-index.js';

/**
 * Статистика чатов по персонажам (количество и дата последнего чата),
 * посчитанная из той же перестраиваемой read-модели, что и список чатов.
 */
export async function getCharacterChatStats(): Promise<ReadonlyMap<string, CharacterChatStatsRecord>> {
  return getSharedChatIndex().getCharacterChatStats();
}
