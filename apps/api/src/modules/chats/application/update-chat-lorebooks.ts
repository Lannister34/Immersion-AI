import type { ChatSessionDto } from '@immersion/contracts/chats';

import type { Clock } from '../../../platform/clock/clock.js';
import { ChatNotFoundError } from './append-chat-messages.js';
import type { ChatRepository } from './chat-repository.js';
import { toChatSessionResponse } from './chat-session-response.js';
import type { ProfileUserNameSource } from './chats-ports.js';

export interface UpdateChatLorebooksCommand {
  chatId: string;
  lorebookIds: string[];
}

export interface UpdateChatLorebooksDependencies {
  readonly chatRepository: Pick<ChatRepository, 'updateGenericChatLorebooks'>;
  readonly clock: Clock;
  readonly profile: ProfileUserNameSource;
}

export async function updateChatLorebooks(
  { chatId, lorebookIds }: UpdateChatLorebooksCommand,
  { chatRepository, clock, profile }: UpdateChatLorebooksDependencies,
): Promise<ChatSessionDto> {
  const session = await chatRepository.updateGenericChatLorebooks(chatId, lorebookIds, clock.now().toISOString());

  if (!session) {
    throw new ChatNotFoundError(chatId);
  }

  return toChatSessionResponse(session, profile);
}
