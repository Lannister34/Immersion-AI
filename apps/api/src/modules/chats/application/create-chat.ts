import crypto from 'node:crypto';

import { type CreateChatCommand, type CreateChatResponse, CreateChatResponseSchema } from '@immersion/contracts/chats';

import type { Clock } from '../../../platform/clock/clock.js';
import { renderChatGreeting } from './chat-greeting.js';
import type { AppendChatMessageInput } from './chat-records.js';
import type { ChatRepository } from './chat-repository.js';
import { toChatSummaryDto } from './chat-session-response.js';
import type { ChatCharacterReader, ChatScenarioReader, ProfileUserNameSource } from './chats-ports.js';

export interface CreateChatDependencies {
  readonly characters: ChatCharacterReader;
  readonly chatRepository: Pick<ChatRepository, 'createGenericChat'>;
  readonly clock: Clock;
  readonly profile: ProfileUserNameSource;
  readonly scenarios: ChatScenarioReader;
}

export async function createChat(
  command: CreateChatCommand,
  { characters, chatRepository, clock, profile, scenarios }: CreateChatDependencies,
): Promise<CreateChatResponse> {
  const createdAt = clock.now().toISOString();
  const userName = profile.getProfileUserName();

  let characterId: string | null = null;
  let characterName: string | null = null;
  let scenarioId: string | null = null;
  let scenarioName: string | null = null;
  let title = command.title?.trim() || 'Новый чат';
  let scenarioGreeting: string | null = null;
  let scenarioContent: string | null = null;
  const seedMessages: AppendChatMessageInput[] = [];

  if (command.scenarioId) {
    const scenario = await scenarios.getScenario(command.scenarioId);
    scenarioId = scenario.id;
    scenarioName = scenario.name;
    scenarioContent = scenario.content;
    if (!command.title?.trim()) {
      title = scenario.name;
    }
    if (scenario.firstMessage.trim().length > 0) {
      scenarioGreeting = scenario.firstMessage;
    }
  }

  if (command.characterId) {
    const character = await characters.getCharacter(command.characterId);
    characterId = character.id;
    characterName = character.name;
    if (!command.title?.trim() && !command.scenarioId) {
      title = `Чат с ${character.name}`;
    }
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
