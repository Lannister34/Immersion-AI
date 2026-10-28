import type { ChatSessionDto } from '@immersion/contracts/chats';

import type { Clock } from '../../../platform/clock/clock.js';
import { ChatNotFoundError } from './append-chat-messages.js';
import type { ChatRepository, GenericChatBindingsUpdate } from './chat-repository.js';
import { toChatSessionResponse } from './chat-session-response.js';
import type { ChatCharacterReader, ChatScenarioReader, ProfileUserNameSource } from './chats-ports.js';

export interface UpdateChatBindingsInput {
  chatId: string;
  characterId?: string | null | undefined;
  scenarioId?: string | null | undefined;
}

export interface UpdateChatBindingsDependencies {
  readonly characters: ChatCharacterReader;
  readonly chatRepository: Pick<ChatRepository, 'updateGenericChatBindings'>;
  readonly clock: Clock;
  readonly profile: ProfileUserNameSource;
  readonly scenarios: ChatScenarioReader;
}

export async function updateChatBindings(
  input: UpdateChatBindingsInput,
  { characters, chatRepository, clock, profile, scenarios }: UpdateChatBindingsDependencies,
): Promise<ChatSessionDto> {
  const updates: GenericChatBindingsUpdate = {};

  if (input.characterId !== undefined) {
    if (input.characterId === null || input.characterId === '') {
      updates.characterId = null;
      updates.characterName = null;
    } else {
      const character = await characters.getCharacter(input.characterId);
      updates.characterId = character.id;
      updates.characterName = character.name;
    }
  }

  if (input.scenarioId !== undefined) {
    if (input.scenarioId === null || input.scenarioId === '') {
      updates.scenarioId = null;
      updates.scenarioName = null;
    } else {
      const scenario = await scenarios.getScenario(input.scenarioId);
      updates.scenarioId = scenario.id;
      updates.scenarioName = scenario.name;
    }
  }

  const session = await chatRepository.updateGenericChatBindings(input.chatId, updates, clock.now().toISOString());
  if (!session) {
    throw new ChatNotFoundError(input.chatId);
  }
  return toChatSessionResponse(session, profile);
}
