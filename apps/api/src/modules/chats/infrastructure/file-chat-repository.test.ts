import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { createKeyedSerialQueue } from '../../../platform/concurrency/keyed-serial-queue.js';
import { type CapturingLogger, createCapturingLogger } from '../../../test-support/capturing-logger.js';
import { failFileStatOf } from '../../../test-support/failing-file-stat.js';
import { readStoredChatFile } from '../../../test-support/stored-chat-file.js';
import { createTemporaryProject } from '../../../test-support/temporary-project.js';
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
  let chatsDirectory = '';
  let logs: CapturingLogger;

  beforeEach(async () => {
    const project = await createTemporaryProject('empty');
    onTestFinished(() => project.remove());
    chatsDirectory = path.join(project.dataRoot, 'чаты без персонажа');
    logs = createCapturingLogger();
  });

  function createRepository(): FileChatRepository {
    return new FileChatRepository({ chatsDirectory, logger: logs.logger, writeQueue: createKeyedSerialQueue() });
  }

  function resolveChatFilePath(chatId: string) {
    return path.join(chatsDirectory, `${chatId}.jsonl`);
  }

  it(
    'serializes concurrent appends and leaves a coherent JSONL chat file',
    async () => {
      const chatId = 'concurrent-chat';
      const repository = createRepository();
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
    const repository = createRepository();

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
    const repository = createRepository();

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
    const repository = createRepository();

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
    const repository = createRepository();

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
    const repository = createRepository();

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
    const repository = createRepository();

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
    const repository = createRepository();

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
    const repository = createRepository();

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

    const directoryEntries = await fs.readdir(chatsDirectory);
    expect(directoryEntries).toEqual([`${sourceChatId}.jsonl`]);
  });

  it('returns null when forking from a non-existent source chat', async () => {
    const repository = createRepository();

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

  describe('forking a chat with images', () => {
    const SOURCE_CHAT_ID = 'source-with-images';
    const BRANCH_CHAT_ID = 'branch-with-images';

    afterEach(() => {
      vi.restoreAllMocks();
    });

    function attachmentsDirectoryOf(chatId: string) {
      return path.join(chatsDirectory, `${chatId}.files`);
    }

    function pngAttachment(id: string) {
      return { id, mimeType: 'image/png' as const };
    }

    async function createSourceChat(
      repository: FileChatRepository,
      storedFiles: Readonly<Record<string, string>>,
      messageAttachmentIds: readonly (readonly string[])[],
    ) {
      await repository.createGenericChat({
        id: SOURCE_CHAT_ID,
        title: 'Картинки',
        userName: 'Tester',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      for (const [attachmentId, content] of Object.entries(storedFiles)) {
        await repository.writeChatAttachment(SOURCE_CHAT_ID, attachmentId, Buffer.from(content));
      }
      await repository.appendGenericChatMessages(
        SOURCE_CHAT_ID,
        messageAttachmentIds.map((attachmentIds, index) => ({
          attachments: attachmentIds.map(pngAttachment),
          content: `message ${index + 1}`,
          createdAt: `2026-01-01T00:00:0${index + 1}.000Z`,
          role: index % 2 === 0 ? 'user' : 'assistant',
        })),
      );
    }

    function forkThrough(repository: FileChatRepository, throughIndex: number) {
      return repository.forkGenericChat({
        createdAt: '2026-01-01T01:00:00.000Z',
        newChatId: BRANCH_CHAT_ID,
        sourceChatId: SOURCE_CHAT_ID,
        throughIndex,
        title: 'Картинки (ветка)',
      });
    }

    function warningsAbout(attachmentId: string) {
      return logs.lines.filter((line) => line.level === 'warn' && Object.values(line).includes(attachmentId));
    }

    it('forks a chat together with the attachment files its kept messages reference', async () => {
      const repository = createRepository();
      await createSourceChat(repository, { 'a.png': 'first image', 'b.png': 'second image', 'tail.png': 'tail' }, [
        ['a.png'],
        ['a.png', 'b.png'],
        ['tail.png'],
      ]);

      await expect(forkThrough(repository, 2)).resolves.toMatchObject({ id: BRANCH_CHAT_ID });

      expect((await fs.readdir(attachmentsDirectoryOf(BRANCH_CHAT_ID))).sort()).toEqual(['a.png', 'b.png']);
      expect((await fs.stat(path.join(attachmentsDirectoryOf(BRANCH_CHAT_ID), 'a.png'))).nlink).toBe(2);
      const branch = await repository.getGenericChatSession(BRANCH_CHAT_ID);
      expect(branch?.messages.map((message) => message.attachments.map((attachment) => attachment.id))).toEqual([
        ['a.png'],
        ['a.png', 'b.png'],
      ]);

      await expect(repository.deleteGenericChat(SOURCE_CHAT_ID)).resolves.toBe(true);

      expect((await repository.readChatAttachment(BRANCH_CHAT_ID, 'a.png'))?.toString()).toBe('first image');
      expect((await repository.readChatAttachment(BRANCH_CHAT_ID, 'b.png'))?.toString()).toBe('second image');
    });

    it('keeps the source images when the branch is deleted', async () => {
      const repository = createRepository();
      await createSourceChat(repository, { 'a.png': 'first image' }, [['a.png']]);
      await forkThrough(repository, 1);

      await expect(repository.deleteGenericChat(BRANCH_CHAT_ID)).resolves.toBe(true);

      expect((await repository.readChatAttachment(SOURCE_CHAT_ID, 'a.png'))?.toString()).toBe('first image');
    });

    it('copies the attachment files when the filesystem cannot hard-link them', async () => {
      const repository = createRepository();
      await createSourceChat(repository, { 'a.png': 'first image' }, [['a.png']]);
      vi.spyOn(fs, 'link').mockRejectedValue(Object.assign(new Error('EXDEV: link'), { code: 'EXDEV' }));

      await forkThrough(repository, 1);
      await repository.deleteGenericChat(SOURCE_CHAT_ID);

      expect((await fs.stat(path.join(attachmentsDirectoryOf(BRANCH_CHAT_ID), 'a.png'))).nlink).toBe(1);
      expect((await repository.readChatAttachment(BRANCH_CHAT_ID, 'a.png'))?.toString()).toBe('first image');
    });

    it('forks a chat whose source attachment is already missing and logs the dangling reference', async () => {
      const repository = createRepository();
      await createSourceChat(repository, { 'a.png': 'first image' }, [['a.png', 'missing.png']]);

      await expect(forkThrough(repository, 1)).resolves.toMatchObject({ id: BRANCH_CHAT_ID });

      expect(await fs.readdir(attachmentsDirectoryOf(BRANCH_CHAT_ID))).toEqual(['a.png']);
      const branch = await repository.getGenericChatSession(BRANCH_CHAT_ID);
      expect(branch?.messages[0]?.attachments.map((attachment) => attachment.id)).toEqual(['a.png', 'missing.png']);
      expect(warningsAbout('missing.png')).toEqual([
        expect.objectContaining({
          chatId: SOURCE_CHAT_ID,
          msg: 'Branch source attachment is missing; the branch keeps a dangling reference',
        }),
      ]);
    });

    it('forks a chat without images without creating an attachment folder', async () => {
      const repository = createRepository();
      await createSourceChat(repository, {}, [[], []]);

      await forkThrough(repository, 2);

      expect((await fs.readdir(chatsDirectory)).sort()).toEqual([`${BRANCH_CHAT_ID}.jsonl`, `${SOURCE_CHAT_ID}.jsonl`]);
    });

    it.each([
      '../outside.png',
      '..\\outside.png',
      'nested/inner.png',
      'C:outside.png',
      '.hidden.png',
      'x\u0000.png',
      `${'ж'.repeat(130)}.png`,
      `${'a'.repeat(300)}.png`,
    ])('forks a chat whose stored attachment name %j is not a plain file name, and writes nothing outside the branch folder', async (hostileId) => {
      const repository = createRepository();
      await fs.mkdir(chatsDirectory, { recursive: true });
      await fs.writeFile(path.join(chatsDirectory, 'outside.png'), 'planted');
      await createSourceChat(repository, { 'фото 1.png': 'plain image' }, [['фото 1.png', hostileId]]);
      const entriesBefore = (await fs.readdir(chatsDirectory)).sort();

      await expect(forkThrough(repository, 1)).resolves.toMatchObject({ id: BRANCH_CHAT_ID });

      expect(await fs.readdir(attachmentsDirectoryOf(BRANCH_CHAT_ID))).toEqual(['фото 1.png']);
      expect((await fs.readdir(chatsDirectory)).sort()).toEqual(
        [...entriesBefore, `${BRANCH_CHAT_ID}.files`, `${BRANCH_CHAT_ID}.jsonl`].sort(),
      );
      await expect(fs.readFile(path.join(chatsDirectory, 'outside.png'), 'utf8')).resolves.toBe('planted');
      expect(warningsAbout(hostileId)).not.toEqual([]);
    });

    it('forks a chat whose stored attachment name is longer than the filesystem allows', async () => {
      const repository = createRepository();
      const longId = `${'ж'.repeat(130)}.png`;
      await createSourceChat(repository, { 'a.png': 'first image' }, [['a.png', longId]]);
      const realLink = fs.link;
      vi.spyOn(fs, 'link').mockImplementation(async (existingPath, newPath) =>
        path.basename(String(newPath)) === longId
          ? Promise.reject(Object.assign(new Error('ENAMETOOLONG: link'), { code: 'ENAMETOOLONG' }))
          : realLink(existingPath, newPath),
      );

      await expect(forkThrough(repository, 1)).resolves.toMatchObject({ id: BRANCH_CHAT_ID });

      expect(await fs.readdir(attachmentsDirectoryOf(BRANCH_CHAT_ID))).toEqual(['a.png']);
      expect(warningsAbout(longId)).toEqual([
        expect.objectContaining({
          msg: 'Branch source attachment name is not a plain file name; the branch keeps a dangling reference',
        }),
      ]);
    });

    it('forks a chat whose messages name one image in two letter cases', async () => {
      const repository = createRepository();
      await createSourceChat(repository, { 'Photo.png': 'image' }, [['Photo.png'], ['photo.png']]);

      await expect(forkThrough(repository, 2)).resolves.toMatchObject({ id: BRANCH_CHAT_ID });

      expect((await repository.readChatAttachment(BRANCH_CHAT_ID, 'Photo.png'))?.toString()).toBe('image');
    });

    it('removes the branch attachment folder and creates no branch when an image cannot be linked', async () => {
      const repository = createRepository();
      await createSourceChat(repository, { 'a.png': 'first image', 'b.png': 'second image' }, [['a.png', 'b.png']]);
      const realLink = fs.link;
      vi.spyOn(fs, 'link').mockImplementation(async (existingPath, newPath) =>
        path.basename(String(newPath)) === 'b.png'
          ? Promise.reject(Object.assign(new Error('EIO: link'), { code: 'EIO' }))
          : realLink(existingPath, newPath),
      );

      await expect(forkThrough(repository, 1)).rejects.toMatchObject({ code: 'EIO' });

      expect((await fs.readdir(chatsDirectory)).sort()).toEqual([`${SOURCE_CHAT_ID}.files`, `${SOURCE_CHAT_ID}.jsonl`]);
      expect((await fs.readdir(attachmentsDirectoryOf(SOURCE_CHAT_ID))).sort()).toEqual(['a.png', 'b.png']);
    });

    it('removes the branch attachment folder when the branch transcript cannot be written', async () => {
      const repository = createRepository();
      await createSourceChat(repository, { 'a.png': 'first image' }, [['a.png']]);
      const realRename = fs.rename;
      vi.spyOn(fs, 'rename').mockImplementation(async (oldPath, newPath) =>
        path.basename(String(newPath)) === `${BRANCH_CHAT_ID}.jsonl`
          ? Promise.reject(Object.assign(new Error('ENOSPC: rename'), { code: 'ENOSPC' }))
          : realRename(oldPath, newPath),
      );

      await expect(forkThrough(repository, 1)).rejects.toMatchObject({ code: 'ENOSPC' });

      expect((await fs.readdir(chatsDirectory)).sort()).toEqual([`${SOURCE_CHAT_ID}.files`, `${SOURCE_CHAT_ID}.jsonl`]);
    });

    it('refuses to fork into an attachment folder it did not create and leaves that folder alone', async () => {
      const repository = createRepository();
      await createSourceChat(repository, { 'a.png': 'first image' }, [['a.png']]);
      await fs.mkdir(attachmentsDirectoryOf(BRANCH_CHAT_ID));
      await fs.writeFile(path.join(attachmentsDirectoryOf(BRANCH_CHAT_ID), 'kept.png'), 'not ours');

      await expect(forkThrough(repository, 1)).rejects.toMatchObject({ code: 'EEXIST' });

      expect(await fs.readdir(attachmentsDirectoryOf(BRANCH_CHAT_ID))).toEqual(['kept.png']);
      await expect(fs.access(resolveChatFilePath(BRANCH_CHAT_ID))).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });

  it('deletes a chat file and reports true', async () => {
    const chatId = 'delete-me';
    const repository = createRepository();

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
    const repository = createRepository();
    await expect(repository.deleteGenericChat('never-existed')).resolves.toBe(false);
  });

  it('updates generation settings without dropping existing messages', async () => {
    const chatId = 'settings-chat';
    const repository = createRepository();

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
    const repository = createRepository();
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
      const repository = createRepository();
      await createChats(repository, ['kept', 'gone']);
      failFileStatOf('gone.jsonl', 'ENOENT');

      const stats = await repository.listChatFileStats();

      expect(stats.map((stat) => stat.chatId)).toEqual(['kept']);
      expect(logs.lines.filter((line) => line.level === 'warn')).toEqual([]);
    });

    it('leaves out a chat file whose metadata cannot be read and logs why instead of hiding the error', async () => {
      const repository = createRepository();
      await createChats(repository, ['kept', 'locked']);
      failFileStatOf('locked.jsonl', 'EPERM');

      const stats = await repository.listChatFileStats();

      expect(stats.map((stat) => stat.chatId)).toEqual(['kept']);
      expect(logs.lines).toContainEqual(expect.objectContaining({ chatId: 'locked', level: 'warn' }));
    });
  });
});
