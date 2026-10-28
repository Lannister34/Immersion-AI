import type { ChatSessionDto } from '@immersion/contracts/chats';

import type { AppendChatMessageInput } from './chat-records.js';
import type { AppendGenericChatMessagesOptions, ChatRepository } from './chat-repository.js';
import { toChatSessionResponse } from './chat-session-response.js';
import type { ProfileUserNameSource } from './chats-ports.js';

export class ChatNotFoundError extends Error {
  constructor(chatId: string) {
    super(`Chat session not found: ${chatId}`);
    this.name = 'ChatNotFoundError';
  }
}

export class ChatMessageNotFoundError extends Error {
  constructor(chatId: string, messageIndex: number) {
    super(`Chat message not found: ${chatId}#${messageIndex}`);
    this.name = 'ChatMessageNotFoundError';
  }
}

export interface AppendChatMessagesCommand extends AppendGenericChatMessagesOptions {
  chatId: string;
  messages: AppendChatMessageInput[];
}

export interface AppendChatMessagesDependencies {
  readonly chatRepository: Pick<ChatRepository, 'appendGenericChatMessages'>;
  readonly profile: ProfileUserNameSource;
}

export async function appendChatMessages(
  { chatId, messages, ...options }: AppendChatMessagesCommand,
  dependencies: AppendChatMessagesDependencies,
): Promise<ChatSessionDto> {
  const session = await dependencies.chatRepository.appendGenericChatMessages(chatId, messages, options);

  if (!session) {
    throw new ChatNotFoundError(chatId);
  }

  return toChatSessionResponse(session, dependencies.profile);
}
