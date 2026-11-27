import { fileBaseNameFrom } from '../../../platform/storage/file-base-name.js';
import { ChatNotFoundError } from './append-chat-messages.js';
import type { ChatRepository } from './chat-repository.js';

export interface ChatExportPayload {
  body: string;
  fileName: string;
}

export interface ExportChatDependencies {
  readonly chatRepository: Pick<ChatRepository, 'readChatExport'>;
}

export async function exportChat(
  { chatId }: { chatId: string },
  { chatRepository }: ExportChatDependencies,
): Promise<ChatExportPayload> {
  const exported = await chatRepository.readChatExport(chatId);

  if (!exported) {
    throw new ChatNotFoundError(chatId);
  }

  return {
    body: exported.body,
    fileName: `${fileBaseNameFrom(exported.title, 'chat')}.jsonl`,
  };
}
