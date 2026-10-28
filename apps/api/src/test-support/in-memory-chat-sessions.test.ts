import { describe, expect, it } from 'vitest';

import { InMemoryChatSessions } from './in-memory-chat-sessions.js';
import { createManualClock } from './manual-clock.js';

const CREATED_AT = '2026-04-01T11:00:00.000Z';

describe('InMemoryChatSessions', () => {
  it('appends messages in order and summarizes the chat from the last one', async () => {
    const chats = new InMemoryChatSessions();
    chats.create('chat-1', CREATED_AT);

    const session = await chats.appendChatMessages('chat-1', [
      {
        attachments: [{ id: 'a.png', mimeType: 'image/png' }],
        content: 'Привет.',
        createdAt: CREATED_AT,
        role: 'user',
      },
      { content: 'Здравствуй.', createdAt: '2026-04-01T11:00:01.000Z', reasoning: 'мысль', role: 'assistant' },
    ]);

    expect(session.messages).toEqual([
      {
        attachments: [{ id: 'a.png', mimeType: 'image/png', url: '/api/chats/chat-1/attachments/a.png' }],
        content: 'Привет.',
        createdAt: CREATED_AT,
        id: 'chat-1-1',
        reasoning: null,
        role: 'user',
      },
      {
        attachments: [],
        content: 'Здравствуй.',
        createdAt: '2026-04-01T11:00:01.000Z',
        id: 'chat-1-2',
        reasoning: 'мысль',
        role: 'assistant',
      },
    ]);
    expect(session.chat).toMatchObject({
      lastMessagePreview: 'Здравствуй.',
      messageCount: 2,
      updatedAt: '2026-04-01T11:00:01.000Z',
    });
    expect(await chats.getChatSession('chat-1')).toEqual(session);
  });

  it('refuses an append that requires an empty transcript once the chat has messages', async () => {
    const chats = new InMemoryChatSessions();
    chats.create('chat-2', CREATED_AT);
    await chats.appendChatMessages('chat-2', [{ content: 'Первое.', createdAt: CREATED_AT, role: 'user' }]);

    await expect(
      chats.appendChatMessages('chat-2', [{ content: 'Второе.', createdAt: CREATED_AT, role: 'assistant' }], {
        requireEmptyTranscript: true,
      }),
    ).rejects.toThrow('Chat chat-2 already has messages.');
  });

  it('continues the last assistant message only while it is still the one the caller read', async () => {
    const chats = new InMemoryChatSessions();
    chats.create('chat-3', CREATED_AT);
    await chats.appendChatMessages('chat-3', [{ content: 'Жили-были', createdAt: CREATED_AT, role: 'assistant' }]);

    const continued = await chats.appendAssistantMessageContinuation('chat-3', {
      continuation: ' дед и баба.',
      expectedContentPrefix: 'Жили-были',
      expectedMessageIndex: 1,
      updatedAt: '2026-04-01T11:00:05.000Z',
    });

    expect(continued.messages.at(-1)?.content).toBe('Жили-были дед и баба.');
    await expect(
      chats.appendAssistantMessageContinuation('chat-3', {
        continuation: ' Конец.',
        expectedContentPrefix: 'Жили-были',
        expectedMessageIndex: 2,
        updatedAt: '2026-04-01T11:00:06.000Z',
      }),
    ).rejects.toThrow('The last message of chat chat-3 changed.');
  });

  it('renames a chat only while its title is still the one the caller read, stamped by its clock', async () => {
    const chats = new InMemoryChatSessions({
      clock: createManualClock({ start: new Date('2026-04-01T12:00:00.000Z') }),
    });
    chats.create('chat-4', CREATED_AT);

    const renamed = await chats.updateChatTitle({
      chatId: 'chat-4',
      expectedCurrentTitle: 'Чат в памяти',
      title: 'Сказка о репке',
    });

    expect(renamed).toMatchObject({ title: 'Сказка о репке', updatedAt: '2026-04-01T12:00:00.000Z' });
    expect((await chats.getChatSession('chat-4'))?.chat).toEqual(renamed);
    await expect(
      chats.updateChatTitle({ chatId: 'chat-4', expectedCurrentTitle: 'Чат в памяти', title: 'Другое' }),
    ).rejects.toThrow('The title of chat chat-4 changed.');
  });

  it('knows no chat it did not create', async () => {
    const chats = new InMemoryChatSessions();

    expect(await chats.getChatSession('missing')).toBeNull();
    await expect(chats.appendChatMessages('missing', [])).rejects.toThrow('Chat missing does not exist in memory.');
  });
});
