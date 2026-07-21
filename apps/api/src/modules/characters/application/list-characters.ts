import { type CharacterListResponse, CharacterListResponseSchema } from '@immersion/contracts/characters';

import { getCharacterChatStats } from '../../indexing/index.js';
import { listCharacterFiles } from '../infrastructure/file-character-repository.js';

export interface CharacterChatUsageRecord {
  chatCount: number;
  lastChatAt: string | null;
}

/**
 * Порт к модулю indexing: статистика чатов по персонажам приходит из
 * перестраиваемой read-модели и никогда не является источником истины.
 */
export interface CharacterChatStatsPort {
  getCharacterChatStats(): Promise<ReadonlyMap<string, CharacterChatUsageRecord>>;
}

export async function listCharacters(statsPort?: CharacterChatStatsPort): Promise<CharacterListResponse> {
  const chatStatsPort = statsPort ?? { getCharacterChatStats };
  const [summaries, chatStats] = await Promise.all([listCharacterFiles(), chatStatsPort.getCharacterChatStats()]);

  return CharacterListResponseSchema.parse({
    items: summaries.map(({ filePath: _filePath, ...summary }) => ({
      ...summary,
      chatCount: chatStats.get(summary.id)?.chatCount ?? 0,
      lastChatAt: chatStats.get(summary.id)?.lastChatAt ?? null,
    })),
  });
}
