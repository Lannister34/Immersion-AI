import type { ChatSessionDto } from '@immersion/contracts/chats';

import { FileChatRepository } from '../infrastructure/file-chat-repository.js';
import { ChatNotFoundError } from './append-chat-messages.js';
import type { AppendContinuationToLastAssistantMessageInput } from './chat-repository.js';
import { toChatSessionResponse } from './chat-session-response.js';

export async function appendAssistantMessageContinuation(
  chatId: string,
  input: AppendContinuationToLastAssistantMessageInput,
): Promise<ChatSessionDto> {
  const chatRepository = new FileChatRepository();
  const session = await chatRepository.appendContinuationToLastAssistantMessage(chatId, input);

  if (!session) {
    throw new ChatNotFoundError(chatId);
  }

  return toChatSessionResponse(session);
}
