import { describe, expect, it } from 'vitest';

import { CHAT_MESSAGE_MAX_ATTACHMENTS } from '../common/upload-limits.js';
import { StartChatReplyCommandSchema, StartChatReplyGenerationCommandSchema } from './index.js';

function replyWithAttachments(count: number, message = 'Что на картинках?'): unknown {
  return {
    attachmentIds: Array.from({ length: count }, (_, index) => `image-${index}.png`),
    chatId: 'chat-1',
    message,
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

describe('chat reply content', () => {
  it('accepts images without text and trims the empty text to an empty message', () => {
    for (const message of ['', '  \n\t ']) {
      const parsed = StartChatReplyGenerationCommandSchema.parse(replyWithAttachments(1, message));

      expect(parsed).toEqual({ attachmentIds: ['image-0.png'], chatId: 'chat-1', message: '', mode: 'reply' });
    }
  });

  it('accepts text without images', () => {
    expect(StartChatReplyCommandSchema.safeParse({ chatId: 'chat-1', message: 'Привет' }).success).toBe(true);
  });

  it('refuses a reply that has neither text nor images', () => {
    for (const command of [
      { chatId: 'chat-1', message: '' },
      { chatId: 'chat-1', message: '   ' },
      { attachmentIds: [], chatId: 'chat-1', message: ' \n ' },
    ]) {
      expect(StartChatReplyCommandSchema.safeParse(command).success, JSON.stringify(command)).toBe(false);
      expect(StartChatReplyGenerationCommandSchema.safeParse(command).success, JSON.stringify(command)).toBe(false);
    }
  });
});
