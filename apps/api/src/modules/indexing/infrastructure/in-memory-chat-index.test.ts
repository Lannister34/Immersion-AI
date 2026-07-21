import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listChatFileStats, readChatSummaryWithSearchText } from '../../chats/index.js';
import { FileChatRepository } from '../../chats/infrastructure/file-chat-repository.js';
import { type ChatIndexSourcePort, InMemoryChatIndex } from './in-memory-chat-index.js';

const SMOKE_DATA_ROOT = fileURLToPath(new URL('../../../../testdata/smoke-data', import.meta.url));

interface ChatFileInput {
  characterId?: string;
  characterName?: string;
  createdAt: string;
  messages: Array<{ content: string; isUser: boolean; sentAt: string }>;
  title: string;
  updatedAt: string;
}

describe('InMemoryChatIndex', () => {
  let previousDataRoot: string | undefined;
  let temporaryDataRoot: string;

  beforeEach(async () => {
    previousDataRoot = process.env.IMMERSION_DATA_ROOT;
    temporaryDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-api-chat-index-'));
    await fs.cp(SMOKE_DATA_ROOT, temporaryDataRoot, { recursive: true });
    process.env.IMMERSION_DATA_ROOT = temporaryDataRoot;
  });

  afterEach(async () => {
    if (previousDataRoot) {
      process.env.IMMERSION_DATA_ROOT = previousDataRoot;
    } else {
      delete process.env.IMMERSION_DATA_ROOT;
    }

    await fs.rm(temporaryDataRoot, { recursive: true, force: true });
  });

  function resolveChatFilePath(chatId: string) {
    return path.join(temporaryDataRoot, 'chats', '_no_character_', `${chatId}.jsonl`);
  }

  async function writeRawChatFile(chatId: string, lines: string[]) {
    await fs.mkdir(path.dirname(resolveChatFilePath(chatId)), { recursive: true });
    await fs.writeFile(resolveChatFilePath(chatId), `${lines.join('\n')}\n`, 'utf8');
  }

  async function writeChatFile(chatId: string, input: ChatFileInput) {
    await writeRawChatFile(chatId, [
      JSON.stringify({
        chat_metadata: {
          createdAt: input.createdAt,
          title: input.title,
          updatedAt: input.updatedAt,
        },
        character_id: input.characterId ?? '',
        character_name: input.characterName ?? '',
        user_name: 'Тестер',
      }),
      ...input.messages.map((message) =>
        JSON.stringify({ is_user: message.isUser, mes: message.content, send_date: message.sentAt }),
      ),
    ]);
  }

  function createCountingSource() {
    const parsedChatIds: string[] = [];
    const source: ChatIndexSourcePort = {
      listChatFileStats,
      readChatSummaryWithSearchText: async (chatId) => {
        parsedChatIds.push(chatId);
        return readChatSummaryWithSearchText(chatId);
      },
    };

    return { parsedChatIds, source };
  }

  it('parses every chat on the first query and nothing when files are unchanged', async () => {
    await writeChatFile('alpha', {
      createdAt: '2026-01-01T00:00:00.000Z',
      messages: [{ content: 'Первое', isUser: true, sentAt: '2026-01-01T00:00:01.000Z' }],
      title: 'Альфа',
      updatedAt: '2026-01-01T00:00:01.000Z',
    });
    await writeChatFile('beta', {
      createdAt: '2026-01-02T00:00:00.000Z',
      messages: [{ content: 'Второе', isUser: true, sentAt: '2026-01-02T00:00:01.000Z' }],
      title: 'Бета',
      updatedAt: '2026-01-02T00:00:01.000Z',
    });

    const { parsedChatIds, source } = createCountingSource();
    const index = new InMemoryChatIndex(source);

    const firstListing = await index.listChatSummaries();
    expect(firstListing.map((summary) => summary.id)).toEqual(['beta', 'alpha']);
    expect([...parsedChatIds].sort()).toEqual(['alpha', 'beta']);

    const secondListing = await index.listChatSummaries();
    expect(secondListing.map((summary) => summary.id)).toEqual(['beta', 'alpha']);
    expect(parsedChatIds).toHaveLength(2);
  });

  it('reparses only the file whose mtime/size changed', async () => {
    await writeChatFile('stable', {
      createdAt: '2026-01-01T00:00:00.000Z',
      messages: [{ content: 'Не меняюсь', isUser: true, sentAt: '2026-01-01T00:00:01.000Z' }],
      title: 'Стабильный',
      updatedAt: '2026-01-01T00:00:01.000Z',
    });
    await writeChatFile('touched', {
      createdAt: '2026-01-02T00:00:00.000Z',
      messages: [{ content: 'Старый текст', isUser: true, sentAt: '2026-01-02T00:00:01.000Z' }],
      title: 'Изменяемый',
      updatedAt: '2026-01-02T00:00:01.000Z',
    });

    const { parsedChatIds, source } = createCountingSource();
    const index = new InMemoryChatIndex(source);
    await index.listChatSummaries();
    expect(parsedChatIds).toHaveLength(2);

    await writeChatFile('touched', {
      createdAt: '2026-01-02T00:00:00.000Z',
      messages: [
        { content: 'Старый текст', isUser: true, sentAt: '2026-01-02T00:00:01.000Z' },
        { content: 'Новый текст', isUser: false, sentAt: '2026-01-02T00:00:02.000Z' },
      ],
      title: 'Изменяемый',
      updatedAt: '2026-01-02T00:00:02.000Z',
    });

    const listing = await index.listChatSummaries();
    expect(parsedChatIds).toHaveLength(3);
    expect(parsedChatIds.slice(2)).toEqual(['touched']);
    expect(listing.find((summary) => summary.id === 'touched')?.messageCount).toBe(2);
    expect(listing.find((summary) => summary.id === 'touched')?.lastMessagePreview).toBe('Новый текст');
  });

  it('drops chats whose files were deleted', async () => {
    await writeChatFile('kept', {
      createdAt: '2026-01-01T00:00:00.000Z',
      messages: [{ content: 'Остаюсь', isUser: true, sentAt: '2026-01-01T00:00:01.000Z' }],
      title: 'Оставшийся',
      updatedAt: '2026-01-01T00:00:01.000Z',
    });
    await writeChatFile('removed', {
      createdAt: '2026-01-02T00:00:00.000Z',
      messages: [{ content: 'Удаляюсь', isUser: true, sentAt: '2026-01-02T00:00:01.000Z' }],
      title: 'Удаляемый',
      updatedAt: '2026-01-02T00:00:01.000Z',
    });

    const index = new InMemoryChatIndex(createCountingSource().source);
    expect((await index.listChatSummaries()).map((summary) => summary.id)).toEqual(['removed', 'kept']);

    await fs.unlink(resolveChatFilePath('removed'));

    expect((await index.listChatSummaries()).map((summary) => summary.id)).toEqual(['kept']);
  });

  it('matches the search needle against title, character name, and message content', async () => {
    await writeChatFile('with-aria', {
      characterId: 'Aria.json',
      characterName: 'Ария',
      createdAt: '2026-01-01T00:00:00.000Z',
      messages: [{ content: 'Поговорим про глину', isUser: true, sentAt: '2026-01-01T00:00:01.000Z' }],
      title: 'Планы на осень',
      updatedAt: '2026-01-01T00:00:01.000Z',
    });
    await writeChatFile('other', {
      createdAt: '2026-01-02T00:00:00.000Z',
      messages: [{ content: 'Совсем другой разговор', isUser: true, sentAt: '2026-01-02T00:00:01.000Z' }],
      title: 'Второй чат',
      updatedAt: '2026-01-02T00:00:01.000Z',
    });

    const index = new InMemoryChatIndex(createCountingSource().source);

    const byTitle = await index.listChatSummaries({ searchText: 'ОСЕНЬ' });
    expect(byTitle.map((summary) => summary.id)).toEqual(['with-aria']);

    const byCharacter = await index.listChatSummaries({ searchText: 'ария' });
    expect(byCharacter.map((summary) => summary.id)).toEqual(['with-aria']);

    const byContent = await index.listChatSummaries({ searchText: 'глину' });
    expect(byContent.map((summary) => summary.id)).toEqual(['with-aria']);

    const noMatch = await index.listChatSummaries({ searchText: 'ничего похожего' });
    expect(noMatch).toEqual([]);
  });

  it('computes per-character chat stats from indexed summaries', async () => {
    await writeChatFile('aria-early', {
      characterId: 'Aria.json',
      characterName: 'Ария',
      createdAt: '2026-01-01T00:00:00.000Z',
      messages: [{ content: 'Первый чат', isUser: true, sentAt: '2026-01-01T00:00:01.000Z' }],
      title: 'Ранний',
      updatedAt: '2026-01-01T00:00:01.000Z',
    });
    await writeChatFile('aria-late', {
      characterId: 'Aria.json',
      characterName: 'Ария',
      createdAt: '2026-01-03T00:00:00.000Z',
      messages: [{ content: 'Поздний чат', isUser: true, sentAt: '2026-01-03T00:00:01.000Z' }],
      title: 'Поздний',
      updatedAt: '2026-01-03T00:00:01.000Z',
    });
    await writeChatFile('ember-only', {
      characterId: 'Ember.png',
      characterName: 'Эмбер',
      createdAt: '2026-01-02T00:00:00.000Z',
      messages: [{ content: 'Дракон', isUser: true, sentAt: '2026-01-02T00:00:01.000Z' }],
      title: 'Дракон',
      updatedAt: '2026-01-02T00:00:01.000Z',
    });
    await writeChatFile('generic', {
      createdAt: '2026-01-04T00:00:00.000Z',
      messages: [{ content: 'Без персонажа', isUser: true, sentAt: '2026-01-04T00:00:01.000Z' }],
      title: 'Свободный',
      updatedAt: '2026-01-04T00:00:01.000Z',
    });

    const index = new InMemoryChatIndex(createCountingSource().source);
    const stats = await index.getCharacterChatStats();

    expect(stats.get('Aria.json')).toEqual({ chatCount: 2, lastChatAt: '2026-01-03T00:00:01.000Z' });
    expect(stats.get('Ember.png')).toEqual({ chatCount: 1, lastChatAt: '2026-01-02T00:00:01.000Z' });
    expect(stats.size).toBe(2);
  });

  it('excludes malformed files without failing, skips reparsing them until they change, and heals after a fix', async () => {
    await writeChatFile('healthy', {
      createdAt: '2026-01-01T00:00:00.000Z',
      messages: [{ content: 'Живой', isUser: true, sentAt: '2026-01-01T00:00:01.000Z' }],
      title: 'Живой',
      updatedAt: '2026-01-01T00:00:01.000Z',
    });
    await writeRawChatFile('broken', [JSON.stringify({ user_name: 'Тестер', character_name: '' }), 'not-json']);

    const { parsedChatIds, source } = createCountingSource();
    const index = new InMemoryChatIndex(source);

    expect((await index.listChatSummaries()).map((summary) => summary.id)).toEqual(['healthy']);
    expect(parsedChatIds).toHaveLength(2);

    // Неизменившийся битый файл не перечитывается на каждый запрос.
    expect((await index.listChatSummaries()).map((summary) => summary.id)).toEqual(['healthy']);
    expect(parsedChatIds).toHaveLength(2);

    await writeChatFile('broken', {
      createdAt: '2026-01-02T00:00:00.000Z',
      messages: [{ content: 'Починили', isUser: true, sentAt: '2026-01-02T00:00:01.000Z' }],
      title: 'Починенный',
      updatedAt: '2026-01-02T00:00:01.000Z',
    });

    expect((await index.listChatSummaries()).map((summary) => summary.id)).toEqual(['broken', 'healthy']);
  });

  it('matches the canonical full-scan listing on a cold start', async () => {
    await writeChatFile('parity-aria', {
      characterId: 'Aria.json',
      characterName: 'Ария',
      createdAt: '2026-01-01T00:00:00.000Z',
      messages: [
        { content: 'Привет, ты в студии впервые?', isUser: false, sentAt: '2026-01-01T00:00:01.000Z' },
        { content: 'Да, расскажи про печь', isUser: true, sentAt: '2026-01-01T00:00:02.000Z' },
      ],
      title: 'Чат с Ария',
      updatedAt: '2026-01-01T00:00:02.000Z',
    });
    await writeChatFile('parity-generic', {
      createdAt: '2026-01-02T00:00:00.000Z',
      messages: [{ content: 'Свободный разговор', isUser: true, sentAt: '2026-01-02T00:00:01.000Z' }],
      title: 'Без персонажа',
      updatedAt: '2026-01-02T00:00:01.000Z',
    });
    // Легаси-файл без заголовка: обе реализации должны прочитать его одинаково.
    await writeRawChatFile('parity-legacy', [
      JSON.stringify({ is_user: true, mes: 'Первая строка без заголовка', send_date: '2026-01-03T00:00:01.000Z' }),
      JSON.stringify({ is_user: false, mes: 'Ответ модели', send_date: '2026-01-03T00:00:02.000Z' }),
    ]);

    const repository = new FileChatRepository();
    const index = new InMemoryChatIndex(createCountingSource().source);

    expect(await index.listChatSummaries()).toEqual(await repository.listGenericChats());
    expect(await index.listChatSummaries({ searchText: 'печь' })).toEqual(
      await repository.listGenericChats({ searchText: 'печь' }),
    );
    expect(await index.listChatSummaries({ searchText: 'ария' })).toEqual(
      await repository.listGenericChats({ searchText: 'ария' }),
    );
  });
});
