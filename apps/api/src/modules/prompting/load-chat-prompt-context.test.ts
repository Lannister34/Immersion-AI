import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ChatSessionDto } from '@immersion/contracts/chats';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadChatPromptContext } from './application/load-chat-prompt-context.js';

function buildSession(characterId: string, scenarioId: string): ChatSessionDto {
  return {
    characterAvatarUrl: null,
    characterId,
    characterName: 'Ария',
    scenarioId,
    scenarioName: 'Пикник',
    lorebookIds: [],
    chat: {
      characterAvatarUrl: null,
      characterId,
      characterName: 'Ария',
      scenarioId,
      scenarioName: 'Пикник',
      lorebookIds: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'chat-1',
      lastMessagePreview: null,
      messageCount: 0,
      title: 'Context test',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    generationSettings: {
      additionalInstructions: null,
      samplerPresetId: null,
      sampling: {
        contextTrimStrategy: null,
        maxContextLength: null,
        maxTokens: null,
        minP: null,
        presencePenalty: null,
        repeatPenalty: null,
        repeatPenaltyRange: null,
        temperature: null,
        topK: null,
        topP: null,
      },
      systemPrompt: null,
    },
    messages: [],
    userName: 'Tester',
  };
}

describe('loadChatPromptContext', () => {
  let previousDataRoot: string | undefined;
  let temporaryDataRoot: string;

  beforeEach(async () => {
    previousDataRoot = process.env.IMMERSION_DATA_ROOT;
    temporaryDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-prompt-context-'));
    process.env.IMMERSION_DATA_ROOT = temporaryDataRoot;
  });

  afterEach(async () => {
    if (previousDataRoot) {
      process.env.IMMERSION_DATA_ROOT = previousDataRoot;
    } else {
      delete process.env.IMMERSION_DATA_ROOT;
    }
    await fs.rm(temporaryDataRoot, { recursive: true, force: true });
  });

  async function writeJson(directory: string, fileName: string, content: Record<string, unknown>) {
    await fs.mkdir(path.join(temporaryDataRoot, directory), { recursive: true });
    await fs.writeFile(path.join(temporaryDataRoot, directory, fileName), JSON.stringify(content), 'utf8');
  }

  it('prefers the linked scenario over the scenario on the character card', async () => {
    await writeJson('characters', 'Aria.json', {
      description: 'Молодая скульпторша.',
      name: 'Ария',
      personality: 'Тихая.',
      scenario: 'Вечер в мастерской.',
    });
    await writeJson('scenarios', 'Пикник.json', {
      concept: 'Летний день.',
      content: 'Пикник у реки.',
      name: 'Пикник',
    });

    const context = await loadChatPromptContext(buildSession('Aria.json', 'Пикник.json'));

    expect(context.character?.name).toBe('Ария');
    expect(context.characterScenarioContent).toBe('Пикник у реки.');
  });
});
