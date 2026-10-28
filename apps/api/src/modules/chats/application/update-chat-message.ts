import type { ChatSessionDto } from '@immersion/contracts/chats';

import type { Clock } from '../../../platform/clock/clock.js';
import { ChatMessageNotFoundError, ChatNotFoundError } from './append-chat-messages.js';
import type { ChatRepository } from './chat-repository.js';
import { toChatSessionResponse } from './chat-session-response.js';
import type { ProfileUserNameSource } from './chats-ports.js';

export interface UpdateChatMessageCommand {
  chatId: string;
  content: string;
  messageIndex: number;
}

export interface UpdateChatMessageDependencies {
  readonly chatRepository: Pick<ChatRepository, 'getGenericChatSession' | 'updateGenericChatMessage'>;
  readonly clock: Clock;
  readonly profile: ProfileUserNameSource;
}

export async function updateChatMessage(
  { chatId, content, messageIndex }: UpdateChatMessageCommand,
  { chatRepository, clock, profile }: UpdateChatMessageDependencies,
): Promise<ChatSessionDto> {
  const existing = await chatRepository.getGenericChatSession(chatId);

  if (!existing) {
    throw new ChatNotFoundError(chatId);
  }

  if (messageIndex < 1 || messageIndex > existing.messages.length) {
    throw new ChatMessageNotFoundError(chatId, messageIndex);
  }

  const session = await chatRepository.updateGenericChatMessage(
    chatId,
    messageIndex,
    content,
    clock.now().toISOString(),
  );

  if (!session) {
    throw new ChatMessageNotFoundError(chatId, messageIndex);
  }

  return toChatSessionResponse(session, profile);
}
