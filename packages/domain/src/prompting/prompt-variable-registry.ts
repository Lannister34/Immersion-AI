export const promptVariableKeys = [
  'character.description',
  'character.exampleDialogue',
  'character.name',
  'character.personality',
  'scenario.content',
  'user.name',
  'user.persona',
] as const;

export type PromptVariableKey = (typeof promptVariableKeys)[number];

const promptVariableKeySet = new Set<string>(promptVariableKeys);

export const promptVariableAliases = {
  char: 'character.name',
  description: 'character.description',
  mesExample: 'character.exampleDialogue',
  personality: 'character.personality',
  scenario: 'scenario.content',
  user: 'user.name',
  userPersona: 'user.persona',
} as const satisfies Record<string, PromptVariableKey>;

export type PromptVariableAlias = keyof typeof promptVariableAliases;

export type PromptVariableValues = Partial<Record<PromptVariableKey, string | null | undefined>>;

export function isPromptVariableKey(value: string): value is PromptVariableKey {
  return promptVariableKeySet.has(value);
}

export function isPromptVariableAlias(value: string): value is PromptVariableAlias {
  return Object.hasOwn(promptVariableAliases, value);
}

export function resolvePromptVariableKey(value: string): PromptVariableKey | null {
  if (isPromptVariableKey(value)) {
    return value;
  }

  if (isPromptVariableAlias(value)) {
    return promptVariableAliases[value];
  }

  return null;
}

export function readPromptVariable(values: PromptVariableValues, key: PromptVariableKey): string {
  const value = values[key];

  return typeof value === 'string' ? value : '';
}
