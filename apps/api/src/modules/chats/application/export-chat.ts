import { ChatNotFoundError } from './append-chat-messages.js';
import type { ChatRepository } from './chat-repository.js';

export interface ChatExportPayload {
  body: string;
  fileName: string;
}

export interface ExportChatDependencies {
  readonly chatRepository: Pick<ChatRepository, 'readChatExport'>;
}

function sanitizeForFileName(input: string): string {
  const trimmed = input.trim();
  const collapsed = trimmed.replace(/[\\/:*?"<>|]+/gu, '_').replace(/\s+/gu, '_');
  if (collapsed.length === 0) {
    return 'chat';
  }
  return collapsed.length > 80 ? collapsed.slice(0, 80) : collapsed;
}

export async function exportChat(
  { chatId }: { chatId: string },
  { chatRepository }: ExportChatDependencies,
): Promise<ChatExportPayload> {
  const exported = await chatRepository.readChatExport(chatId);

  if (!exported) {
    throw new ChatNotFoundError(chatId);
  }

  const baseName = sanitizeForFileName(exported.title) || `chat-${chatId.slice(0, 8)}`;

  return {
    body: exported.body,
    fileName: `${baseName}.jsonl`,
  };
}
