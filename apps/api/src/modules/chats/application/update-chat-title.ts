import type { ChatSummaryDto } from '@immersion/contracts/chats';

import type { Clock } from '../../../platform/clock/clock.js';
import { ChatNotFoundError } from './append-chat-messages.js';
import type { ChatRepository, UpdateGenericChatTitleOptions } from './chat-repository.js';
import { toChatSummaryDto } from './chat-session-response.js';

export interface UpdateChatTitleInput extends UpdateGenericChatTitleOptions {
  chatId: string;
  title: string;
}

export interface UpdateChatTitleDependencies {
  readonly chatRepository: Pick<ChatRepository, 'updateGenericChatTitle'>;
  readonly clock: Clock;
}

export async function updateChatTitle(
  { chatId, expectedCurrentTitle, title }: UpdateChatTitleInput,
  { chatRepository, clock }: UpdateChatTitleDependencies,
): Promise<ChatSummaryDto> {
  const session = await chatRepository.updateGenericChatTitle(chatId, title, clock.now().toISOString(), {
    ...(expectedCurrentTitle !== undefined ? { expectedCurrentTitle } : {}),
  });

  if (!session) {
    throw new ChatNotFoundError(chatId);
  }

  return toChatSummaryDto(session.chat);
}
