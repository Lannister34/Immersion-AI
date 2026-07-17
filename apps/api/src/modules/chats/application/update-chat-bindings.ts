import type { ChatSessionDto } from '@immersion/contracts/chats';
import { getCharacter } from '../../characters/index.js';
import { getScenario } from '../../scenarios/index.js';
import { FileChatRepository } from '../infrastructure/file-chat-repository.js';
import { ChatNotFoundError } from './append-chat-messages.js';
import { toChatSessionResponse } from './chat-session-response.js';

export interface UpdateChatBindingsInput {
  chatId: string;
  characterId?: string | null | undefined;
  scenarioId?: string | null | undefined;
  now?: () => Date;
}

export async function updateChatBindings(input: UpdateChatBindingsInput): Promise<ChatSessionDto> {
  const now = input.now ?? (() => new Date());
  const updates: {
    characterId?: string | null;
    characterName?: string | null;
    scenarioId?: string | null;
    scenarioName?: string | null;
  } = {};

  if (input.characterId !== undefined) {
    if (input.characterId === null || input.characterId === '') {
      updates.characterId = null;
      updates.characterName = null;
    } else {
      // Throws CharacterNotFoundError with the same route mapping as before.
      const character = await getCharacter(input.characterId);
      updates.characterId = character.id;
      updates.characterName = character.name;
    }
  }

  if (input.scenarioId !== undefined) {
    if (input.scenarioId === null || input.scenarioId === '') {
      updates.scenarioId = null;
      updates.scenarioName = null;
    } else {
      // Throws ScenarioNotFoundError with the same route mapping as before.
      const scenario = await getScenario(input.scenarioId);
      updates.scenarioId = scenario.id;
      updates.scenarioName = scenario.name;
    }
  }

  const repository = new FileChatRepository();
  const session = await repository.updateGenericChatBindings(input.chatId, updates, now().toISOString());
  if (!session) {
    throw new ChatNotFoundError(input.chatId);
  }
  return toChatSessionResponse(session);
}
