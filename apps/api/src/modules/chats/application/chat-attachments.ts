import { randomUUID } from 'node:crypto';

import {
  type ChatMessageAttachmentDto,
  type UploadChatAttachmentCommand,
  UploadChatAttachmentCommandSchema,
  type UploadChatAttachmentResponse,
  UploadChatAttachmentResponseSchema,
} from '@immersion/contracts/chats';

import {
  deleteChatAttachmentFiles,
  FileChatRepository,
  readChatAttachmentFile,
  writeChatAttachmentFile,
} from '../infrastructure/file-chat-repository.js';
import { ChatNotFoundError } from './append-chat-messages.js';
import type { ChatAttachmentMimeTypeRecord, ChatMessageAttachmentRecord } from './chat-records.js';

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const EXTENSION_BY_MIME_TYPE: Record<ChatAttachmentMimeTypeRecord, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const MIME_TYPE_BY_EXTENSION: Record<string, ChatAttachmentMimeTypeRecord> = {
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export class InvalidChatAttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidChatAttachmentError';
  }
}

export class ChatAttachmentNotFoundError extends Error {
  constructor(attachmentId: string) {
    super(`Chat attachment not found: ${attachmentId}`);
    this.name = 'ChatAttachmentNotFoundError';
  }
}

export function chatAttachmentUrl(chatId: string, attachmentId: string): string {
  return `/api/chats/${encodeURIComponent(chatId)}/attachments/${encodeURIComponent(attachmentId)}`;
}

export function toChatMessageAttachmentDto(chatId: string, attachment: ChatMessageAttachmentRecord) {
  return {
    id: attachment.id,
    mimeType: attachment.mimeType,
    url: chatAttachmentUrl(chatId, attachment.id),
  } satisfies ChatMessageAttachmentDto;
}

function detectImageMimeType(bytes: Buffer): ChatAttachmentMimeTypeRecord | null {
  if (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
    return 'image/png';
  }

  if (bytes.subarray(0, 3).toString('hex') === 'ffd8ff') {
    return 'image/jpeg';
  }

  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }

  return null;
}

export async function uploadChatAttachment(chatId: string, input: unknown): Promise<UploadChatAttachmentResponse> {
  const command: UploadChatAttachmentCommand = UploadChatAttachmentCommandSchema.parse(input);
  const chatRepository = new FileChatRepository();

  if (!(await chatRepository.getGenericChatSession(chatId))) {
    throw new ChatNotFoundError(chatId);
  }

  const bytes = Buffer.from(command.contentBase64, 'base64');

  if (bytes.length === 0) {
    throw new InvalidChatAttachmentError('Файл изображения пуст.');
  }

  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    throw new InvalidChatAttachmentError('Изображение больше 8 МБ.');
  }

  const mimeType = detectImageMimeType(bytes);

  if (!mimeType || mimeType !== command.mimeType) {
    throw new InvalidChatAttachmentError('Содержимое файла не совпадает с заявленным форматом изображения.');
  }

  const attachmentId = `${randomUUID()}${EXTENSION_BY_MIME_TYPE[mimeType]}`;
  await writeChatAttachmentFile(chatId, attachmentId, bytes);

  return UploadChatAttachmentResponseSchema.parse({
    attachment: toChatMessageAttachmentDto(chatId, { id: attachmentId, mimeType }),
  });
}

export interface ChatAttachmentPayload {
  body: Buffer;
  contentType: ChatAttachmentMimeTypeRecord;
}

function mimeTypeOfAttachmentId(attachmentId: string): ChatAttachmentMimeTypeRecord | null {
  const dotIndex = attachmentId.lastIndexOf('.');

  return dotIndex === -1 ? null : (MIME_TYPE_BY_EXTENSION[attachmentId.slice(dotIndex).toLowerCase()] ?? null);
}

export async function getChatAttachment(chatId: string, attachmentId: string): Promise<ChatAttachmentPayload> {
  const bytes = await readChatAttachmentFile(chatId, attachmentId);

  if (!bytes) {
    throw new ChatAttachmentNotFoundError(attachmentId);
  }

  const contentType = detectImageMimeType(bytes) ?? mimeTypeOfAttachmentId(attachmentId);

  if (!contentType) {
    throw new ChatAttachmentNotFoundError(attachmentId);
  }

  return { body: bytes, contentType };
}

export async function resolveChatAttachments(
  chatId: string,
  attachmentIds: readonly string[],
): Promise<ChatMessageAttachmentRecord[]> {
  const attachments: ChatMessageAttachmentRecord[] = [];

  for (const attachmentId of attachmentIds) {
    const mimeType = mimeTypeOfAttachmentId(attachmentId);
    const bytes = mimeType ? await readChatAttachmentFile(chatId, attachmentId) : null;

    if (!mimeType || !bytes) {
      throw new ChatAttachmentNotFoundError(attachmentId);
    }

    attachments.push({ id: attachmentId, mimeType });
  }

  return attachments;
}

export async function readChatAttachmentDataUrl(chatId: string, attachmentId: string): Promise<string | null> {
  const bytes = await readChatAttachmentFile(chatId, attachmentId);

  if (!bytes) {
    return null;
  }

  const mimeType = detectImageMimeType(bytes) ?? mimeTypeOfAttachmentId(attachmentId);

  return mimeType ? `data:${mimeType};base64,${bytes.toString('base64')}` : null;
}

export async function deleteChatAttachments(chatId: string): Promise<void> {
  await deleteChatAttachmentFiles(chatId);
}
