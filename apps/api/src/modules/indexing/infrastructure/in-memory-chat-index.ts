import { getSharedApiLogger } from '../../../lib/logger.js';
import type {
  ChatFileStatRecord,
  ChatSearchTextRecord,
  ChatSummaryRecord,
  ChatSummaryWithSearchText,
} from '../../chats/index.js';

export interface ChatIndexSourcePort {
  listChatFileStats(): Promise<ChatFileStatRecord[]>;
  readChatSummaryWithSearchText(chatId: string): Promise<ChatSummaryWithSearchText | null>;
}

export interface ChatIndexQueryOptions {
  searchText?: string;
}

export interface CharacterChatStatsRecord {
  chatCount: number;
  lastChatAt: string | null;
}

interface ChatIndexSlot {
  data: { searchText: ChatSearchTextRecord; summary: ChatSummaryRecord } | null;
  fileMtimeMs: number;
  fileSize: number;
}

function matchesNeedle(searchText: ChatSearchTextRecord, needle: string): boolean {
  if (!needle) {
    return true;
  }
  if (searchText.titleLower.includes(needle)) {
    return true;
  }
  if (searchText.characterNameLower?.includes(needle)) {
    return true;
  }

  return searchText.messageTextsLower.some((text) => text.includes(needle));
}

export class InMemoryChatIndex {
  private readonly slots = new Map<string, ChatIndexSlot>();
  private refreshQueue: Promise<void> = Promise.resolve();

  constructor(private readonly source: ChatIndexSourcePort) {}

  async listChatSummaries(options: ChatIndexQueryOptions = {}): Promise<ChatSummaryRecord[]> {
    await this.refresh();

    const needle = options.searchText?.trim().toLowerCase() ?? '';
    const summaries: ChatSummaryRecord[] = [];
    for (const slot of this.slots.values()) {
      if (slot.data && matchesNeedle(slot.data.searchText, needle)) {
        summaries.push(slot.data.summary);
      }
    }

    return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getCharacterChatStats(): Promise<ReadonlyMap<string, CharacterChatStatsRecord>> {
    await this.refresh();

    const stats = new Map<string, CharacterChatStatsRecord>();
    for (const slot of this.slots.values()) {
      const characterId = slot.data?.summary.characterId;
      if (!slot.data || !characterId) {
        continue;
      }

      const current = stats.get(characterId) ?? { chatCount: 0, lastChatAt: null };
      current.chatCount += 1;
      const updatedAt = slot.data.summary.updatedAt;
      if (current.lastChatAt === null || current.lastChatAt.localeCompare(updatedAt) < 0) {
        current.lastChatAt = updatedAt;
      }
      stats.set(characterId, current);
    }

    return stats;
  }

  private refresh(): Promise<void> {
    const run = this.refreshQueue.catch(() => undefined).then(() => this.refreshFromFiles());
    this.refreshQueue = run;

    return run;
  }

  private async refreshFromFiles(): Promise<void> {
    const fileStats = await this.source.listChatFileStats();
    const liveChatIds = new Set(fileStats.map((stat) => stat.chatId));

    for (const chatId of [...this.slots.keys()]) {
      if (!liveChatIds.has(chatId)) {
        this.slots.delete(chatId);
      }
    }

    const changed = fileStats.filter((stat) => {
      const slot = this.slots.get(stat.chatId);

      return !slot || slot.fileMtimeMs !== stat.fileMtimeMs || slot.fileSize !== stat.fileSize;
    });

    await Promise.all(
      changed.map(async (stat) => {
        try {
          const parsed = await this.source.readChatSummaryWithSearchText(stat.chatId);
          if (!parsed) {
            this.slots.delete(stat.chatId);

            return;
          }

          this.slots.set(stat.chatId, {
            data: { searchText: parsed.searchText, summary: parsed.summary },
            fileMtimeMs: stat.fileMtimeMs,
            fileSize: stat.fileSize,
          });
        } catch (error) {
          getSharedApiLogger().warn(
            { chatId: stat.chatId, err: error },
            'Chat index: failed to parse chat file; excluding it from the listing',
          );
          this.slots.set(stat.chatId, { data: null, fileMtimeMs: stat.fileMtimeMs, fileSize: stat.fileSize });
        }
      }),
    );
  }
}
