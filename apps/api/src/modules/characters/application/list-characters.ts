import { type CharacterListResponse, CharacterListResponseSchema } from '@immersion/contracts/characters';

import { getCharacterChatStats } from '../../indexing/index.js';
import { listCharacterFiles } from '../infrastructure/file-character-repository.js';

export interface CharacterChatUsageRecord {
  chatCount: number;
  lastChatAt: string | null;
}

export interface CharacterChatStatsPort {
  getCharacterChatStats(): Promise<ReadonlyMap<string, CharacterChatUsageRecord>>;
}

export function resolveCharacterChatUsage(
  stats: ReadonlyMap<string, CharacterChatUsageRecord>,
  characterId: string,
): CharacterChatUsageRecord {
  const legacyId = `${characterId.replace(/\.json$/iu, '')}.png`;
  const records = [stats.get(characterId), stats.get(legacyId)].filter(
    (record): record is CharacterChatUsageRecord => record !== undefined,
  );

  return {
    chatCount: records.reduce((total, record) => total + record.chatCount, 0),
    lastChatAt: records.reduce<string | null>(
      (latest, record) => (record.lastChatAt && (!latest || record.lastChatAt > latest) ? record.lastChatAt : latest),
      null,
    ),
  };
}

export async function listCharacters(statsPort?: CharacterChatStatsPort): Promise<CharacterListResponse> {
  const chatStatsPort = statsPort ?? { getCharacterChatStats };
  const [summaries, chatStats] = await Promise.all([listCharacterFiles(), chatStatsPort.getCharacterChatStats()]);

  return CharacterListResponseSchema.parse({
    items: summaries.map(({ filePath: _filePath, ...summary }) => ({
      ...summary,
      ...resolveCharacterChatUsage(chatStats, summary.id),
    })),
  });
}
