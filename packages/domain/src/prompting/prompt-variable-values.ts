import type { PromptInputSnapshot } from './prompt-input-snapshot.js';
import type { PromptVariableValues } from './prompt-variable-registry.js';

const legacyUserNameFallback = 'User';

function resolvePromptUserName(snapshot: PromptInputSnapshot): string {
  const preferredUserName = snapshot.chat.customUserName ?? snapshot.user.name;

  if (preferredUserName && preferredUserName.length > 0) {
    return preferredUserName;
  }

  return legacyUserNameFallback;
}

function resolvePromptUserPersona(snapshot: PromptInputSnapshot): string | null {
  return snapshot.chat.customUserPersona ?? snapshot.user.persona;
}

export function buildPromptVariableValues(snapshot: PromptInputSnapshot): PromptVariableValues {
  return Object.freeze({
    'character.description': snapshot.character?.description ?? null,
    'character.exampleDialogue': snapshot.character?.mesExample ?? null,
    'character.name': snapshot.character?.name ?? null,
    'character.personality': snapshot.character?.personality ?? null,
    'scenario.content': snapshot.scenario?.content ?? null,
    'user.name': resolvePromptUserName(snapshot),
    'user.persona': resolvePromptUserPersona(snapshot),
  });
}
