import { ChatAttachmentIdSchema, ChatIdSchema } from '@immersion/contracts/chats';
import { z } from 'zod';

export const ChatRouteParamsSchema = z.object({
  chatId: ChatIdSchema,
});

export const ChatAttachmentRouteParamsSchema = z.object({
  attachmentId: ChatAttachmentIdSchema,
  chatId: ChatIdSchema,
});

export const ChatMessageRouteParamsSchema = z.object({
  chatId: ChatIdSchema,
  messageIndex: z.coerce.number().int().positive(),
});

export const DeleteChatMessageQuerySchema = z.object({
  mode: z.enum(['single', 'from-here']).default('single'),
});

export const ChatListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
});
