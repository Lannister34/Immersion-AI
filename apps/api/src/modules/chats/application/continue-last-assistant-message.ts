import type { ChatSessionDto } from '@immersion/contracts/chats';

import { FileChatRepository } from '../infrastructure/file-chat-repository.js';
import { ChatNotFoundError } from './append-chat-messages.js';
import type { AppendContinuationToLastAssistantMessageInput } from './chat-repository.js';
import { toChatSessionResponse } from './chat-session-response.js';

/**
 * Appends generated continuation text to the last assistant message.
 *
 * The repository re-checks inside the chat write queue that the last message is
 * still the one the continuation was generated for (index + content prefix) and
 * throws ChatLastMessageChangedError otherwise.
 */
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
