import type { ChatSessionDto } from '@immersion/contracts/chats';

import { ChatNotFoundError } from './append-chat-messages.js';
import type { AppendContinuationToLastAssistantMessageInput, ChatRepository } from './chat-repository.js';
import { toChatSessionResponse } from './chat-session-response.js';
import type { ProfileUserNameSource } from './chats-ports.js';

export interface AppendAssistantMessageContinuationCommand extends AppendContinuationToLastAssistantMessageInput {
  chatId: string;
}

export interface AppendAssistantMessageContinuationDependencies {
  readonly chatRepository: Pick<ChatRepository, 'appendContinuationToLastAssistantMessage'>;
  readonly profile: ProfileUserNameSource;
}

export async function appendAssistantMessageContinuation(
  { chatId, ...input }: AppendAssistantMessageContinuationCommand,
  dependencies: AppendAssistantMessageContinuationDependencies,
): Promise<ChatSessionDto> {
  const session = await dependencies.chatRepository.appendContinuationToLastAssistantMessage(chatId, input);

  if (!session) {
    throw new ChatNotFoundError(chatId);
  }

  return toChatSessionResponse(session, dependencies.profile);
}
