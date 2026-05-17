import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { PromptCharacterSnapshot } from '@immersion/domain/prompting';

import { readCharacterDetail } from '../../characters/infrastructure/file-character-repository.js';

export interface ChatCharacterContext {
  character: PromptCharacterSnapshot | null;
  characterScenarioContent: string | null;
}

export async function loadCharacterContextForSession(session: ChatSessionDto): Promise<ChatCharacterContext> {
  if (!session.characterId) {
    return { character: null, characterScenarioContent: null };
  }

  const detail = await readCharacterDetail(session.characterId);
  if (!detail) {
    return { character: null, characterScenarioContent: null };
  }

  const character: PromptCharacterSnapshot = {
    description: detail.description.trim() || null,
    mesExample: detail.exampleDialogue.trim() || null,
    name: detail.name,
    personality: detail.personality.trim() || null,
    systemPrompt: detail.systemPrompt.trim() || null,
  };

  return {
    character,
    characterScenarioContent: detail.scenario.trim() || null,
  };
}
