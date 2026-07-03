import type { ChatSummaryDto } from '@immersion/contracts/chats';

import { FileChatRepository } from '../infrastructure/file-chat-repository.js';
import { ChatNotFoundError } from './append-chat-messages.js';
import { toChatSummaryDto } from './chat-session-response.js';

export interface UpdateChatTitleInput {
  chatId: string;
  title: string;
  expectedCurrentTitle?: string;
  now?: () => Date;
}

export async function updateChatTitle(input: UpdateChatTitleInput): Promise<ChatSummaryDto> {
  const now = input.now ?? (() => new Date());
  const repository = new FileChatRepository();
  const session = await repository.updateGenericChatTitle(input.chatId, input.title, now().toISOString(), {
    ...(input.expectedCurrentTitle !== undefined ? { expectedCurrentTitle: input.expectedCurrentTitle } : {}),
  });

  if (!session) {
    throw new ChatNotFoundError(input.chatId);
  }

  return toChatSummaryDto(session.chat);
}
