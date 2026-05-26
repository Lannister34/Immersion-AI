import type { ChatSessionDto } from '@immersion/contracts/chats';
import { CharacterNotFoundError } from '../../characters/application/get-character-avatar.js';
import { findCharacterFile, readCharacterDetail } from '../../characters/infrastructure/file-character-repository.js';
import { ScenarioNotFoundError } from '../../scenarios/application/get-scenario.js';
import { readScenarioDetail } from '../../scenarios/infrastructure/file-scenario-repository.js';
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
      const summary = await findCharacterFile(input.characterId);
      if (!summary) {
        throw new CharacterNotFoundError(input.characterId);
      }
      const detail = await readCharacterDetail(input.characterId);
      updates.characterId = summary.id;
      updates.characterName = detail?.name ?? summary.name;
    }
  }

  if (input.scenarioId !== undefined) {
    if (input.scenarioId === null || input.scenarioId === '') {
      updates.scenarioId = null;
      updates.scenarioName = null;
    } else {
      const scenario = await readScenarioDetail(input.scenarioId);
      if (!scenario) {
        throw new ScenarioNotFoundError(input.scenarioId);
      }
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
