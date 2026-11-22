import { describe, expect, it } from 'vitest';

import { CHAT_MESSAGE_MAX_ATTACHMENTS } from '../common/upload-limits.js';
import { StartChatReplyCommandSchema } from './index.js';

function replyWithAttachments(count: number): unknown {
  return {
    attachmentIds: Array.from({ length: count }, (_, index) => `image-${index}.png`),
    chatId: 'chat-1',
    message: 'Что на картинках?',
  };
}

describe('chat reply attachment cap', () => {
  it('allows ten images on one message', () => {
    expect(CHAT_MESSAGE_MAX_ATTACHMENTS).toBe(10);
  });

  it('accepts a reply with as many attachments as the cap, and refuses one more', () => {
    expect(StartChatReplyCommandSchema.safeParse(replyWithAttachments(CHAT_MESSAGE_MAX_ATTACHMENTS)).success).toBe(
      true,
    );
    expect(StartChatReplyCommandSchema.safeParse(replyWithAttachments(CHAT_MESSAGE_MAX_ATTACHMENTS + 1)).success).toBe(
      false,
    );
  });
});
