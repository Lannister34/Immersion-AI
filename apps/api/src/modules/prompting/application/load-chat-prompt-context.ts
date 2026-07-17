import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { PromptCharacterSnapshot } from '@immersion/domain/prompting';

import { readCharacterDetail } from '../../characters/infrastructure/file-character-repository.js';
import { readLorebookDetail } from '../../lorebooks/infrastructure/file-lorebook-repository.js';
import { readScenarioDetail } from '../../scenarios/infrastructure/file-scenario-repository.js';

export interface ChatPromptContext {
  character: PromptCharacterSnapshot | null;
  characterScenarioContent: string | null;
  lorebookSections: string[];
}

const LOREBOOK_TRIGGER_LOOKBACK = 16;

function buildKeywordMatcher(keys: readonly string[]): ((haystack: string) => boolean) | null {
  const normalized = keys.map((key) => key.trim().toLowerCase()).filter((key) => key.length > 0);
  if (normalized.length === 0) return null;
  return (haystack) => {
    const lower = haystack.toLowerCase();
    return normalized.some((key) => lower.includes(key));
  };
}

export async function loadChatPromptContext(session: ChatSessionDto): Promise<ChatPromptContext> {
  let character: PromptCharacterSnapshot | null = null;
  let characterScenarioContent: string | null = null;

  if (session.characterId) {
    const detail = await readCharacterDetail(session.characterId);
    if (detail) {
      character = {
        description: detail.description.trim() || null,
        mesExample: detail.exampleDialogue.trim() || null,
        name: detail.name,
        personality: detail.personality.trim() || null,
        systemPrompt: detail.systemPrompt.trim() || null,
      };
      characterScenarioContent = detail.scenario.trim() || null;
    }
  }

  // Linked scenario wins over the character's per-card scenario when present.
  if (session.scenarioId) {
    const scenario = await readScenarioDetail(session.scenarioId);
    if (scenario) {
      const scene = scenario.content.trim() || scenario.concept.trim();
      if (scene.length > 0) {
        characterScenarioContent = scene;
      }
      if (!character) {
        // Synthesise a minimal character so the contextual system template kicks in
        // even when the chat is scenario-only.
        character = {
          description: scenario.concept.trim() || null,
          mesExample: null,
          name: scenario.name,
          personality: null,
          systemPrompt: null,
        };
      }
    }
  }

  const lorebookSections = await collectLorebookSections(session);

  return { character, characterScenarioContent, lorebookSections };
}

async function collectLorebookSections(session: ChatSessionDto): Promise<string[]> {
  if (session.lorebookIds.length === 0) return [];

  const recentText = session.messages
    .slice(-LOREBOOK_TRIGGER_LOOKBACK)
    .map((message) => message.content)
    .join('\n');

  const sections: string[] = [];
  for (const lorebookId of session.lorebookIds) {
    const lorebook = await readLorebookDetail(lorebookId);
    if (!lorebook) continue;

    const triggered: { content: string; priority: number; keys: string[] }[] = [];
    for (const entry of lorebook.entries) {
      if (!entry.enabled) continue;
      if (entry.content.trim().length === 0) continue;
      const matcher = buildKeywordMatcher(entry.keys);
      if (!matcher) continue;
      if (matcher(recentText)) {
        triggered.push({ content: entry.content.trim(), priority: entry.priority, keys: entry.keys });
      }
    }
    if (triggered.length === 0) continue;
    triggered.sort((left, right) => right.priority - left.priority);
    const body = triggered.map((entry) => `- (${entry.keys.join(', ')}): ${entry.content}`).join('\n');
    sections.push(`Lorebook «${lorebook.name}»:\n${body}`);
  }

  return sections;
}
