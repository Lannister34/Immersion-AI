import crypto from 'node:crypto';

import { type CreateChatCommand, type CreateChatResponse, CreateChatResponseSchema } from '@immersion/contracts/chats';

import { getCharacter } from '../../characters/index.js';
import { getScenario } from '../../scenarios/index.js';
import { FileChatRepository } from '../infrastructure/file-chat-repository.js';
import type { AppendChatMessageInput } from './chat-records.js';
import { toChatSummaryDto } from './chat-session-response.js';
import { getDefaultUserName } from './default-user-name.js';

export async function createChat(command: CreateChatCommand): Promise<CreateChatResponse> {
  const chatRepository = new FileChatRepository();
  const createdAt = new Date().toISOString();

  let characterId: string | null = null;
  let characterName: string | null = null;
  let scenarioId: string | null = null;
  let scenarioName: string | null = null;
  let title = command.title?.trim() || 'Новый чат';
  const seedMessages: AppendChatMessageInput[] = [];

  if (command.scenarioId) {
    // Throws ScenarioNotFoundError with the same route mapping as before.
    const scenario = await getScenario(command.scenarioId);
    scenarioId = scenario.id;
    scenarioName = scenario.name;
    if (!command.title?.trim()) {
      title = scenario.name;
    }
  }

  if (command.characterId) {
    // Throws CharacterNotFoundError with the same route mapping as before.
    const character = await getCharacter(command.characterId);
    characterId = character.id;
    characterName = character.name;
    if (!command.title?.trim() && !command.scenarioId) {
      title = `Чат с ${character.name}`;
    }
    if (character.firstMessage.trim().length > 0) {
      seedMessages.push({
        content: character.firstMessage,
        createdAt,
        role: 'assistant',
      });
    }
  }

  const summary = await chatRepository.createGenericChat({
    characterId,
    characterName,
    scenarioId,
    scenarioName,
    lorebookIds: command.lorebookIds ?? [],
    createdAt,
    id: crypto.randomUUID(),
    seedMessages,
    title,
    userName: getDefaultUserName(),
  });

  return CreateChatResponseSchema.parse({
    chat: toChatSummaryDto(summary),
  });
}
