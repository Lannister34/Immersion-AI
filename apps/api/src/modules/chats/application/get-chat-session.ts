import type { GetChatSessionResponse } from '@immersion/contracts/chats';

import type { ChatRepository } from './chat-repository.js';
import { toChatSessionResponse } from './chat-session-response.js';
import type { ProfileUserNameSource } from './chats-ports.js';

export interface GetChatSessionDependencies {
  readonly chatRepository: Pick<ChatRepository, 'getGenericChatSession'>;
  readonly profile: ProfileUserNameSource;
}

export async function getChatSession(
  { chatId }: { chatId: string },
  { chatRepository, profile }: GetChatSessionDependencies,
): Promise<GetChatSessionResponse | null> {
  const session = await chatRepository.getGenericChatSession(chatId);
  if (!session) {
    return null;
  }

  return toChatSessionResponse(session, profile);
}
