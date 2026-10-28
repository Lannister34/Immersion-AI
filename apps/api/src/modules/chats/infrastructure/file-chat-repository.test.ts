import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { getSharedApiLogger } from '../../../platform/logging/shared-api-logger.js';
import { failFileStatOf } from '../../../test-support/failing-file-stat.js';
import { readStoredChatFile } from '../../../test-support/stored-chat-file.js';
import { useTemporaryDataRoot } from '../../../test-support/use-temporary-data-root.js';
import { ChatTranscriptChangedError } from '../application/chat-conflicts.js';
import type { ChatMessageRecord } from '../application/chat-records.js';
import { FileChatRepository } from './file-chat-repository.js';

const CONCURRENT_DISK_APPENDS_TIMEOUT_MS = 30_000;

type StoredMessage = Pick<ChatMessageRecord, 'content' | 'role'>;

interface TruncateGuardCase {
  readonly name: string;
  readonly messagesOnDisk: readonly StoredMessage[];
  readonly expectedRemovedMessages: readonly StoredMessage[];
}

const TRUNCATE_GUARD_CASES: readonly TruncateGuardCase[] = [
  {
    name: 'the reply was edited since the read',
    messagesOnDisk: [
      { role: 'user', content: 'вопрос' },
      { role: 'assistant', content: 'ответ после правки' },
    ],
    expectedRemovedMessages: [{ role: 'assistant', content: 'ответ' }],
  },
  {
    name: 'a message was appended since the read',
    messagesOnDisk: [
      { role: 'user', content: 'вопрос' },
      { role: 'assistant', content: 'ответ' },
      { role: 'user', content: 'новый вопрос' },
    ],
    expectedRemovedMessages: [{ role: 'assistant', content: 'ответ' }],
  },
  {
    name: 'a message to remove was deleted since the read',
    messagesOnDisk: [
      { role: 'user', content: 'вопрос' },
      { role: 'assistant', content: 'ответ' },
    ],
    expectedRemovedMessages: [
      { role: 'assistant', content: 'ответ' },
      { role: 'assistant', content: 'продолжение' },
    ],
  },
];

describe('FileChatRepository', () => {
  const dataRoot = useTemporaryDataRoot();

  function resolveChatFilePath(chatId: string) {
    return path.join(dataRoot(), 'chats', '_no_character_', `${chatId}.jsonl`);
  }

  it(
    'serializes concurrent appends and leaves a coherent JSONL chat file',
    async () => {
      const chatId = 'concurrent-chat';
      const repository = new FileChatRepository();
      const expectedMessages = Array.from({ length: 24 }, (_, index) => ({
        content: `message-${index.toString().padStart(2, '0')}`,
        createdAt: `2026-01-01T00:00:${index.toString().padStart(2, '0')}.000Z`,
      }));

      await repository.createGenericChat({
        id: chatId,
        title: 'Concurrent chat',
        userName: 'Tester',
        createdAt: '2026-01-01T00:00:00.000Z',
      });

      await Promise.all(
        expectedMessages.map((message) =>
          repository.appendGenericChatMessages(chatId, [
            {
              role: 'user',
              content: message.content,
              createdAt: message.createdAt,
            },
          ]),
        ),
      );

      const session = await repository.getGenericChatSession(chatId);

      if (!session) {
        throw new Error('Expected chat session to exist after concurrent appends.');
      }

      expect(session.messages.map((message) => message.content)).toEqual(
        expectedMessages.map((message) => message.content),
      );
      expect(session.chat.messageCount).toBe(expectedMessages.length);
      expect(session.chat.lastMessagePreview).toBe(expectedMessages.at(-1)?.content);
      expect(session.chat.updatedAt).toBe(expectedMessages.at(-1)?.createdAt);

      const chatFilePath = resolveChatFilePath(chatId);
      const storedChat = await readStoredChatFile(chatFilePath);

      expect(storedChat.header.chat_metadata.title).toBe('Concurrent chat');
      expect(storedChat.messages.map((line) => line.mes)).toEqual(expectedMessages.map((message) => message.content));

      const directoryEntries = await fs.readdir(path.dirname(chatFilePath));
      expect(directoryEntries.filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
    },
    CONCURRENT_DISK_APPENDS_TIMEOUT_MS,
  );

  it('rewrites a single message content and preserves siblings and ordering', async () => {
    const chatId = 'edit-chat';
    const repository = new FileChatRepository();

    await repository.createGenericChat({
      id: chatId,
      title: 'Edit chat',
      userName: 'Tester',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await repository.appendGenericChatMessages(chatId, [
      { role: 'user', content: 'first', createdAt: '2026-01-01T00:00:01.000Z' },
      { role: 'assistant', content: 'second', createdAt: '2026-01-01T00:00:02.000Z' },
      { role: 'user', content: 'third', createdAt: '2026-01-01T00:00:03.000Z' },
    ]);

    const updatedSession = await repository.updateGenericChatMessage(
      chatId,
      2,
      'second-edited',
      '2026-01-01T00:00:10.000Z',
    );

    expect(updatedSession?.messages.map((message) => message.content)).toEqual(['first', 'second-edited', 'third']);
    expect(updatedSession?.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
    expect(updatedSession?.chat.updatedAt).toBe('2026-01-01T00:00:10.000Z');
    expect(updatedSession?.chat.messageCount).toBe(3);

    const chatFilePath = resolveChatFilePath(chatId);
    const { messages } = await readStoredChatFile(chatFilePath);

    expect(messages.map((line) => line.mes)).toEqual(['first', 'second-edited', 'third']);
    expect(messages[1]?.send_date).toBe('2026-01-01T00:00:02.000Z');

    const directoryEntries = await fs.readdir(path.dirname(chatFilePath));
    expect(directoryEntries.filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
  });

  it('returns null when editing a non-existent message index', async () => {
    const chatId = 'missing-edit-chat';
    const repository = new FileChatRepository();

    await repository.createGenericChat({
      id: chatId,
      title: 'Missing edit chat',
      userName: 'Tester',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await repository.appendGenericChatMessages(chatId, [
      { role: 'user', content: 'only', createdAt: '2026-01-01T00:00:01.000Z' },
    ]);

    await expect(
      repository.updateGenericChatMessage(chatId, 7, 'oops', '2026-01-01T00:00:02.000Z'),
    ).resolves.toBeNull();
    await expect(
      repository.updateGenericChatMessage(chatId, 0, 'oops', '2026-01-01T00:00:02.000Z'),
    ).resolves.toBeNull();

    const session = await repository.getGenericChatSession(chatId);
    expect(session?.messages.map((message) => message.content)).toEqual(['only']);
  });

  it('truncates messages from a given index and bumps the header timestamp', async () => {
    const chatId = 'truncate-chat';
    const repository = new FileChatRepository();

    await repository.createGenericChat({
      id: chatId,
      title: 'Truncate chat',
      userName: 'Tester',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await repository.appendGenericChatMessages(chatId, [
      { role: 'user', content: 'keep-1', createdAt: '2026-01-01T00:00:01.000Z' },
      { role: 'assistant', content: 'keep-2', createdAt: '2026-01-01T00:00:02.000Z' },
      { role: 'user', content: 'drop-1', createdAt: '2026-01-01T00:00:03.000Z' },
      { role: 'assistant', content: 'drop-2', createdAt: '2026-01-01T00:00:04.000Z' },
    ]);

    const truncatedSession = await repository.truncateGenericChatMessagesFromIndex(
      chatId,
      3,
      '2026-01-01T00:01:39.000Z',
    );

    expect(truncatedSession?.messages.map((message) => message.content)).toEqual(['keep-1', 'keep-2']);
    expect(truncatedSession?.chat.messageCount).toBe(2);
    expect(truncatedSession?.chat.updatedAt).toBe('2026-01-01T00:01:39.000Z');
    expect(truncatedSession?.chat.lastMessagePreview).toBe('keep-2');

    const chatFilePath = resolveChatFilePath(chatId);
    expect((await readStoredChatFile(chatFilePath)).messages.map((line) => line.mes)).toEqual(['keep-1', 'keep-2']);

    const directoryEntries = await fs.readdir(path.dirname(chatFilePath));
    expect(directoryEntries.filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
  });

  it('returns null when truncating with an out-of-range index', async () => {
    const chatId = 'missing-truncate-chat';
    const repository = new FileChatRepository();

    await repository.createGenericChat({
      id: chatId,
      title: 'Missing truncate chat',
      userName: 'Tester',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await repository.appendGenericChatMessages(chatId, [
      { role: 'user', content: 'only', createdAt: '2026-01-01T00:00:01.000Z' },
    ]);

    await expect(
      repository.truncateGenericChatMessagesFromIndex(chatId, 5, '2026-01-01T00:00:02.000Z'),
    ).resolves.toBeNull();
    await expect(
      repository.truncateGenericChatMessagesFromIndex(chatId, 0, '2026-01-01T00:00:02.000Z'),
    ).resolves.toBeNull();

    const session = await repository.getGenericChatSession(chatId);
    expect(session?.messages.map((message) => message.content)).toEqual(['only']);
  });

  it.each(TRUNCATE_GUARD_CASES)('refuses to truncate when $name, leaving the file untouched', async ({
    expectedRemovedMessages,
    messagesOnDisk,
  }) => {
    const chatId = 'guarded-truncate-chat';
    const repository = new FileChatRepository();

    await repository.createGenericChat({
      id: chatId,
      title: 'Guarded truncate chat',
      userName: 'Tester',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await repository.appendGenericChatMessages(
      chatId,
      messagesOnDisk.map((message) => ({ ...message, createdAt: '2026-01-01T00:00:01.000Z' })),
    );
    const fileBefore = await fs.readFile(resolveChatFilePath(chatId), 'utf8');

    await expect(
      repository.truncateGenericChatMessagesFromIndex(chatId, 2, '2026-01-01T00:00:03.000Z', {
        expectedRemovedMessages,
      }),
    ).rejects.toBeInstanceOf(ChatTranscriptChangedError);

    expect(await fs.readFile(resolveChatFilePath(chatId), 'utf8')).toBe(fileBefore);
  });

  it('truncates when the messages to remove are exactly the expected ones', async () => {
    const chatId = 'matching-truncate-chat';
    const repository = new FileChatRepository();

    await repository.createGenericChat({
      id: chatId,
      title: 'Matching truncate chat',
      userName: 'Tester',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await repository.appendGenericChatMessages(chatId, [
      { role: 'user', content: 'вопрос', createdAt: '2026-01-01T00:00:01.000Z' },
      { role: 'assistant', content: 'ответ', createdAt: '2026-01-01T00:00:02.000Z' },
      { role: 'assistant', content: 'продолжение', createdAt: '2026-01-01T00:00:03.000Z' },
    ]);

    const truncatedSession = await repository.truncateGenericChatMessagesFromIndex(
      chatId,
      2,
      '2026-01-01T00:00:04.000Z',
      {
        expectedRemovedMessages: [
          { role: 'assistant', content: 'ответ' },
          { role: 'assistant', content: 'продолжение' },
        ],
      },
    );

    expect(truncatedSession?.messages.map((message) => message.content)).toEqual(['вопрос']);
  });

  it('forks a chat with messages up to the chosen index without touching the source', async () => {
    const sourceChatId = 'source-chat';
    const newChatId = 'forked-chat';
    const repository = new FileChatRepository();

    await repository.createGenericChat({
      id: sourceChatId,
      title: 'Source chat',
      userName: 'Tester',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await repository.appendGenericChatMessages(sourceChatId, [
      { role: 'user', content: 'shared-1', createdAt: '2026-01-01T00:00:01.000Z' },
      { role: 'assistant', content: 'shared-2', createdAt: '2026-01-01T00:00:02.000Z' },
      { role: 'user', content: 'shared-3', createdAt: '2026-01-01T00:00:03.000Z' },
      { role: 'assistant', content: 'tail', createdAt: '2026-01-01T00:00:04.000Z' },
    ]);

    const forkSummary = await repository.forkGenericChat({
      createdAt: '2026-01-01T01:00:00.000Z',
      newChatId,
      sourceChatId,
      throughIndex: 3,
      title: 'Source chat (ветка)',
    });

    expect(forkSummary?.id).toBe(newChatId);
    expect(forkSummary?.title).toBe('Source chat (ветка)');
    expect(forkSummary?.createdAt).toBe('2026-01-01T01:00:00.000Z');
    expect(forkSummary?.messageCount).toBe(3);

    const forkedSession = await repository.getGenericChatSession(newChatId);
    expect(forkedSession?.messages.map((message) => message.content)).toEqual(['shared-1', 'shared-2', 'shared-3']);
    expect(forkedSession?.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);

    const sourceSession = await repository.getGenericChatSession(sourceChatId);
    expect(sourceSession?.messages.map((message) => message.content)).toEqual([
      'shared-1',
      'shared-2',
      'shared-3',
      'tail',
    ]);
    expect(sourceSession?.chat.title).toBe('Source chat');

    const directoryEntries = await fs.readdir(path.dirname(resolveChatFilePath(newChatId)));
    expect(directoryEntries.filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
    expect(directoryEntries).toEqual(expect.arrayContaining([`${sourceChatId}.jsonl`, `${newChatId}.jsonl`]));
  });

  it('returns null when forking with an out-of-range index', async () => {
    const sourceChatId = 'fork-missing-source';
    const repository = new FileChatRepository();

    await repository.createGenericChat({
      id: sourceChatId,
      title: 'Source',
      userName: 'Tester',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await repository.appendGenericChatMessages(sourceChatId, [
      { role: 'user', content: 'only', createdAt: '2026-01-01T00:00:01.000Z' },
    ]);

    await expect(
      repository.forkGenericChat({
        createdAt: '2026-01-01T00:00:02.000Z',
        newChatId: 'fork-out-of-range',
        sourceChatId,
        throughIndex: 99,
        title: 'Source (ветка)',
      }),
    ).resolves.toBeNull();

    await expect(
      repository.forkGenericChat({
        createdAt: '2026-01-01T00:00:02.000Z',
        newChatId: 'fork-zero-index',
        sourceChatId,
        throughIndex: 0,
        title: 'Source (ветка)',
      }),
    ).resolves.toBeNull();

    const directoryEntries = await fs.readdir(path.join(dataRoot(), 'chats', '_no_character_'));
    expect(directoryEntries).toEqual([`${sourceChatId}.jsonl`]);
  });

  it('returns null when forking from a non-existent source chat', async () => {
    const repository = new FileChatRepository();

    await expect(
      repository.forkGenericChat({
        createdAt: '2026-01-01T00:00:00.000Z',
        newChatId: 'orphan-fork',
        sourceChatId: 'does-not-exist',
        throughIndex: 1,
        title: 'Orphan (ветка)',
      }),
    ).resolves.toBeNull();
  });

  it('deletes a chat file and reports true', async () => {
    const chatId = 'delete-me';
    const repository = new FileChatRepository();

    await repository.createGenericChat({
      id: chatId,
      title: 'Delete me',
      userName: 'Tester',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await repository.appendGenericChatMessages(chatId, [
      { role: 'user', content: 'bye', createdAt: '2026-01-01T00:00:01.000Z' },
    ]);

    const deleted = await repository.deleteGenericChat(chatId);
    expect(deleted).toBe(true);

    await expect(fs.access(resolveChatFilePath(chatId))).rejects.toMatchObject({ code: 'ENOENT' });

    const session = await repository.getGenericChatSession(chatId);
    expect(session).toBeNull();
  });

  it('returns false when deleting a chat that does not exist', async () => {
    const repository = new FileChatRepository();
    await expect(repository.deleteGenericChat('never-existed')).resolves.toBe(false);
  });

  it('updates generation settings without dropping existing messages', async () => {
    const chatId = 'settings-chat';
    const repository = new FileChatRepository();

    await repository.createGenericChat({
      id: chatId,
      title: 'Settings chat',
      userName: 'Tester',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await repository.appendGenericChatMessages(chatId, [
      {
        role: 'user',
        content: 'Keep me.',
        createdAt: '2026-01-01T00:00:01.000Z',
      },
    ]);

    const updatedSession = await repository.updateGenericChatGenerationSettings(
      chatId,
      {
        additionalInstructions: null,
        samplerPresetId: 'default',
        systemPrompt: 'Chat prompt.',
        sampling: {
          contextTrimStrategy: 'trim_start',
          maxContextLength: 2048,
          maxTokens: 300,
          minP: null,
          presencePenalty: null,
          repeatPenalty: null,
          repeatPenaltyRange: null,
          temperature: 0.4,
          topK: null,
          topP: null,
        },
      },
      '2026-01-01T00:00:02.000Z',
    );

    expect(updatedSession?.messages.map((message) => message.content)).toEqual(['Keep me.']);
    expect(updatedSession?.generationSettings).toMatchObject({
      samplerPresetId: 'default',
      systemPrompt: 'Chat prompt.',
      sampling: {
        contextTrimStrategy: 'trim_start',
        maxContextLength: 2048,
        maxTokens: 300,
        temperature: 0.4,
      },
    });
    expect(updatedSession?.chat.updatedAt).toBe('2026-01-01T00:00:02.000Z');

    const chatFilePath = resolveChatFilePath(chatId);
    const storedChat = await readStoredChatFile(chatFilePath);

    expect(storedChat.messages.map((line) => line.mes)).toEqual(['Keep me.']);
    expect(storedChat.header.generation_settings).toMatchObject({
      sampler_preset_id: 'default',
      system_prompt: 'Chat prompt.',
    });

    const directoryEntries = await fs.readdir(path.dirname(chatFilePath));
    expect(directoryEntries.filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
  });

  it('exports the transcript only after the write queued before the export has landed', async () => {
    const repository = new FileChatRepository();
    await repository.createGenericChat({
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'export-chat',
      title: 'Экспорт',
      userName: 'Tester',
    });

    const appended = repository.appendGenericChatMessages('export-chat', [
      { content: 'Последнее слово.', createdAt: '2026-01-01T00:00:01.000Z', role: 'user' },
    ]);
    const exported = await repository.readChatExport('export-chat');
    await appended;

    expect(exported?.title).toBe('Экспорт');
    expect(exported?.body).toContain('Последнее слово.');
    expect(exported?.body).toBe(await fs.readFile(resolveChatFilePath('export-chat'), 'utf8'));
    await expect(repository.readChatExport('never-existed')).resolves.toBeNull();
  });

  describe('listChatFileStats', () => {
    async function createChats(repository: FileChatRepository, chatIds: string[]) {
      for (const chatId of chatIds) {
        await repository.createGenericChat({
          createdAt: '2026-01-01T00:00:00.000Z',
          id: chatId,
          title: chatId,
          userName: 'Tester',
        });
      }
    }

    it('leaves out a chat file deleted after the directory listing without logging it', async () => {
      const repository = new FileChatRepository();
      await createChats(repository, ['kept', 'gone']);
      failFileStatOf('gone.jsonl', 'ENOENT');
      const warn = vi.spyOn(getSharedApiLogger(), 'warn').mockImplementation(() => undefined);

      const stats = await repository.listChatFileStats();

      expect(stats.map((stat) => stat.chatId)).toEqual(['kept']);
      expect(warn).not.toHaveBeenCalled();
    });

    it('leaves out a chat file whose metadata cannot be read and logs why instead of hiding the error', async () => {
      const repository = new FileChatRepository();
      await createChats(repository, ['kept', 'locked']);
      failFileStatOf('locked.jsonl', 'EPERM');
      const warn = vi.spyOn(getSharedApiLogger(), 'warn').mockImplementation(() => undefined);

      const stats = await repository.listChatFileStats();

      expect(stats.map((stat) => stat.chatId)).toEqual(['kept']);
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ chatId: 'locked' }), expect.any(String));
    });
  });
});
