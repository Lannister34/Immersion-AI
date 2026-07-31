import crypto from 'node:crypto';

import { type CreateChatCommand, type CreateChatResponse, CreateChatResponseSchema } from '@immersion/contracts/chats';

import { getCharacter } from '../../characters/index.js';
import { getScenario } from '../../scenarios/index.js';
import { FileChatRepository } from '../infrastructure/file-chat-repository.js';
import { renderChatGreeting } from './chat-greeting.js';
import type { AppendChatMessageInput } from './chat-records.js';
import { toChatSummaryDto } from './chat-session-response.js';
import { getDefaultUserName } from './default-user-name.js';

export async function createChat(command: CreateChatCommand): Promise<CreateChatResponse> {
  const chatRepository = new FileChatRepository();
  const createdAt = new Date().toISOString();
  const userName = getDefaultUserName();

  let characterId: string | null = null;
  let characterName: string | null = null;
  let scenarioId: string | null = null;
  let scenarioName: string | null = null;
  let title = command.title?.trim() || 'Новый чат';
  let scenarioGreeting: string | null = null;
  let scenarioContent: string | null = null;
  const seedMessages: AppendChatMessageInput[] = [];

  if (command.scenarioId) {
    // Throws ScenarioNotFoundError with the same route mapping as before.
    const scenario = await getScenario(command.scenarioId);
    scenarioId = scenario.id;
    scenarioName = scenario.name;
    scenarioContent = scenario.content;
    if (!command.title?.trim()) {
      title = scenario.name;
    }
    // Привязанный сценарий полностью заменяет базовый сценарий карточки,
    // поэтому его приветствие имеет приоритет; подставляем его ниже, когда
    // уже известен персонаж — из него берётся {{char}}.
    if (scenario.firstMessage.trim().length > 0) {
      scenarioGreeting = scenario.firstMessage;
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
    // Первая фраза карточки принадлежит её базовому сценарию: если к чату
    // привязан отдельный сценарий, приветствие не вставляем — сцена другая.
    const greeting = scenarioGreeting ?? (command.scenarioId ? null : character.firstMessage);
    if (greeting && greeting.trim().length > 0) {
      seedMessages.push({
        content: renderChatGreeting(greeting, {
          characterDescription: character.description,
          characterName: character.name,
          characterPersonality: character.personality,
          scenarioContent: scenarioContent ?? character.scenario,
          userName,
        }),
        createdAt,
        role: 'assistant',
      });
    }
  } else if (scenarioGreeting) {
    seedMessages.push({
      content: renderChatGreeting(scenarioGreeting, { scenarioContent, userName }),
      createdAt,
      role: 'assistant',
    });
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
    userName,
  });

  return CreateChatResponseSchema.parse({
    chat: toChatSummaryDto(summary),
  });
}
