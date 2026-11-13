import { type CharacterListResponse, CharacterListResponseSchema } from '@immersion/contracts/characters';

import type { CharacterStore } from './character-store.js';

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

export interface ListCharactersDependencies {
  readonly characterStore: Pick<CharacterStore, 'listCharacters'>;
  readonly chatStats: CharacterChatStatsPort;
}

export async function listCharacters({
  characterStore,
  chatStats,
}: ListCharactersDependencies): Promise<CharacterListResponse> {
  const [summaries, stats] = await Promise.all([characterStore.listCharacters(), chatStats.getCharacterChatStats()]);

  return CharacterListResponseSchema.parse({
    items: summaries.map((summary) => ({
      ...summary,
      ...resolveCharacterChatUsage(stats, summary.id),
    })),
  });
}
