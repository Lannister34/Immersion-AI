import type { ChatMessageAttachmentDto } from '@immersion/contracts/chats';
import { describe, expect, it } from 'vitest';

import { beginChatDraftSend, EMPTY_CHAT_DRAFT, restoreFailedChatDraftSend } from './chat-draft';

const LIGHTHOUSE: ChatMessageAttachmentDto = {
  id: 'lighthouse.png',
  mimeType: 'image/png',
  url: '/api/chats/chat-1/attachments/lighthouse.png',
};
const SCHOONER: ChatMessageAttachmentDto = {
  id: 'schooner.png',
  mimeType: 'image/png',
  url: '/api/chats/chat-1/attachments/schooner.png',
};

describe('restoreFailedChatDraftSend', () => {
  it('puts the sent text and images first and keeps what was typed and attached meanwhile', () => {
    const sending = beginChatDraftSend({ ...EMPTY_CHAT_DRAFT, attachments: [LIGHTHOUSE], text: 'Первое' });
    const meanwhile = { ...sending, attachments: [SCHOONER], text: 'Второе' };

    expect(
      restoreFailedChatDraftSend(meanwhile, { attachments: [LIGHTHOUSE], text: 'Первое' }, 'Модель недоступна.'),
    ).toMatchObject({
      attachments: [LIGHTHOUSE, SCHOONER],
      isSending: false,
      sendError: 'Модель недоступна.',
      text: 'Первое\nВторое',
    });
  });

  it('restores an image-only send without adding a blank line', () => {
    const sending = beginChatDraftSend({ ...EMPTY_CHAT_DRAFT, attachments: [LIGHTHOUSE] });

    expect(restoreFailedChatDraftSend(sending, { attachments: [LIGHTHOUSE], text: '' }, 'Ошибка.').text).toBe('');
  });
});
