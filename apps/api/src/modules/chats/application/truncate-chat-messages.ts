import type { ChatSessionDto } from '@immersion/contracts/chats';

import type { Clock } from '../../../platform/clock/clock.js';
import { ChatMessageNotFoundError, ChatNotFoundError } from './append-chat-messages.js';
import type { ChatRepository, TruncateGenericChatMessagesOptions } from './chat-repository.js';
import { toChatSessionResponse } from './chat-session-response.js';
import type { ProfileUserNameSource } from './chats-ports.js';

export interface TruncateChatMessagesCommand extends TruncateGenericChatMessagesOptions {
  chatId: string;
  fromIndex: number;
}

export interface TruncateChatMessagesDependencies {
  readonly chatRepository: Pick<ChatRepository, 'getGenericChatSession' | 'truncateGenericChatMessagesFromIndex'>;
  readonly clock: Clock;
  readonly profile: ProfileUserNameSource;
}

export async function truncateChatMessages(
  { chatId, fromIndex, ...options }: TruncateChatMessagesCommand,
  { chatRepository, clock, profile }: TruncateChatMessagesDependencies,
): Promise<ChatSessionDto> {
  const existing = await chatRepository.getGenericChatSession(chatId);

  if (!existing) {
    throw new ChatNotFoundError(chatId);
  }

  if (fromIndex < 1 || fromIndex > existing.messages.length) {
    throw new ChatMessageNotFoundError(chatId, fromIndex);
  }

  const session = await chatRepository.truncateGenericChatMessagesFromIndex(
    chatId,
    fromIndex,
    clock.now().toISOString(),
    options,
  );

  if (!session) {
    throw new ChatMessageNotFoundError(chatId, fromIndex);
  }

  return toChatSessionResponse(session, profile);
}
