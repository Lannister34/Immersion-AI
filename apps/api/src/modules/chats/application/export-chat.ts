import fs from 'node:fs/promises';
import path from 'node:path';

import { resolveDataRoot } from '../../../lib/data-root.js';
import { FileChatRepository } from '../infrastructure/file-chat-repository.js';
import { ChatNotFoundError } from './append-chat-messages.js';

const GENERIC_CHAT_DIRECTORY = '_no_character_';

export interface ChatExportPayload {
  body: string;
  fileName: string;
}

function sanitizeForFileName(input: string): string {
  const trimmed = input.trim();
  const collapsed = trimmed.replace(/[\\/:*?"<>|]+/gu, '_').replace(/\s+/gu, '_');
  if (collapsed.length === 0) {
    return 'chat';
  }
  return collapsed.length > 80 ? collapsed.slice(0, 80) : collapsed;
}

export async function exportChat(chatId: string): Promise<ChatExportPayload> {
  const chatRepository = new FileChatRepository();
  const session = await chatRepository.getGenericChatSession(chatId);

  if (!session) {
    throw new ChatNotFoundError(chatId);
  }

  const filePath = path.join(resolveDataRoot(), 'chats', GENERIC_CHAT_DIRECTORY, `${chatId}.jsonl`);
  const body = await fs.readFile(filePath, 'utf8');
  const baseName = sanitizeForFileName(session.chat.title) || `chat-${chatId.slice(0, 8)}`;

  return {
    body,
    fileName: `${baseName}.jsonl`,
  };
}
