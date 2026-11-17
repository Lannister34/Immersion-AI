import type { ReplyTokenLimit } from './reply-token-limit.js';

export type PromptContextTrimStrategy = 'trim_middle' | 'trim_start';

export type PromptResponseLanguage = 'en' | 'none' | 'ru';

export type PromptTranscriptRole = 'assistant' | 'system' | 'user';

export interface PromptTranscriptMessage {
  content: string;
  id: string | null;
  role: PromptTranscriptRole;
}

export interface PromptChatSnapshot {
  customSystemPrompt: string | null;
  customUserName: string | null;
  customUserPersona: string | null;
  id: string;
  title: string | null;
  transcript: readonly PromptTranscriptMessage[];
}

export interface PromptCharacterSnapshot {
  description: string | null;
  mesExample: string | null;
  name: string;
  personality: string | null;
  systemPrompt: string | null;
}

export interface PromptScenarioSnapshot {
  content: string | null;
  name: string | null;
}

export interface PromptUserSnapshot {
  name: string | null;
  persona: string | null;
}

export interface PromptLorebookEntrySnapshot {
  content: string;
  id: string;
  isEnabled: boolean;
  keywords: readonly string[];
  order: number | null;
}

export interface PromptLorebookSnapshot {
  entries: readonly PromptLorebookEntrySnapshot[];
}

export interface PromptSettingsSnapshot {
  defaultSystemPromptTemplate: string;
  knownDefaultSystemPromptTemplates: readonly string[];
  responseLanguage: PromptResponseLanguage;
  systemPromptTemplate: string | null;
  thinkingEnabled: boolean;
}

export interface PromptGenerationSnapshot {
  maxContextTokens: number;
  replyMaxTokens: ReplyTokenLimit;
  trimStrategy: PromptContextTrimStrategy;
}

export interface PromptInputSnapshot {
  character: PromptCharacterSnapshot | null;
  chat: PromptChatSnapshot;
  generation: PromptGenerationSnapshot;
  lorebook: PromptLorebookSnapshot | null;
  scenario: PromptScenarioSnapshot | null;
  settings: PromptSettingsSnapshot;
  user: PromptUserSnapshot;
}

export interface BuildPromptInputSnapshotInput {
  character?: PromptCharacterSnapshot | null;
  chat: {
    customSystemPrompt?: string | null;
    customUserName?: string | null;
    customUserPersona?: string | null;
    id: string;
    title?: string | null;
    transcript?: readonly PromptTranscriptMessage[];
  };
  generation: PromptGenerationSnapshot;
  lorebook?: PromptLorebookSnapshot | null;
  scenario?: PromptScenarioSnapshot | null;
  settings: {
    defaultSystemPromptTemplate: string;
    knownDefaultSystemPromptTemplates?: readonly string[];
    responseLanguage: PromptResponseLanguage;
    systemPromptTemplate?: string | null;
    thinkingEnabled: boolean;
  };
  user?: {
    name?: string | null;
    persona?: string | null;
  };
}

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function cloneTranscriptMessage(message: PromptTranscriptMessage): PromptTranscriptMessage {
  return Object.freeze({
    content: message.content,
    id: message.id ?? null,
    role: message.role,
  });
}

function cloneCharacterSnapshot(character: PromptCharacterSnapshot): PromptCharacterSnapshot {
  return Object.freeze({
    description: character.description ?? null,
    mesExample: character.mesExample ?? null,
    name: character.name,
    personality: character.personality ?? null,
    systemPrompt: character.systemPrompt ?? null,
  });
}

function cloneScenarioSnapshot(scenario: PromptScenarioSnapshot): PromptScenarioSnapshot {
  return Object.freeze({
    content: scenario.content ?? null,
    name: scenario.name ?? null,
  });
}

function cloneUserSnapshot(user?: BuildPromptInputSnapshotInput['user']): PromptUserSnapshot {
  return Object.freeze({
    name: user?.name ?? null,
    persona: user?.persona ?? null,
  });
}

function cloneLorebookEntrySnapshot(entry: PromptLorebookEntrySnapshot): PromptLorebookEntrySnapshot {
  return Object.freeze({
    content: entry.content,
    id: entry.id,
    isEnabled: entry.isEnabled,
    keywords: freezeArray(entry.keywords),
    order: entry.order ?? null,
  });
}

function cloneLorebookSnapshot(lorebook: PromptLorebookSnapshot): PromptLorebookSnapshot {
  return Object.freeze({
    entries: freezeArray(lorebook.entries.map(cloneLorebookEntrySnapshot)),
  });
}

export function buildPromptInputSnapshot(input: BuildPromptInputSnapshotInput): PromptInputSnapshot {
  const snapshot: PromptInputSnapshot = {
    character: input.character ? cloneCharacterSnapshot(input.character) : null,
    chat: Object.freeze({
      customSystemPrompt: input.chat.customSystemPrompt ?? null,
      customUserName: input.chat.customUserName ?? null,
      customUserPersona: input.chat.customUserPersona ?? null,
      id: input.chat.id,
      title: input.chat.title ?? null,
      transcript: freezeArray((input.chat.transcript ?? []).map(cloneTranscriptMessage)),
    }),
    generation: Object.freeze({
      maxContextTokens: input.generation.maxContextTokens,
      replyMaxTokens: input.generation.replyMaxTokens,
      trimStrategy: input.generation.trimStrategy,
    }),
    lorebook: input.lorebook ? cloneLorebookSnapshot(input.lorebook) : null,
    scenario: input.scenario ? cloneScenarioSnapshot(input.scenario) : null,
    settings: Object.freeze({
      defaultSystemPromptTemplate: input.settings.defaultSystemPromptTemplate,
      knownDefaultSystemPromptTemplates: freezeArray(input.settings.knownDefaultSystemPromptTemplates ?? []),
      responseLanguage: input.settings.responseLanguage,
      systemPromptTemplate: input.settings.systemPromptTemplate ?? null,
      thinkingEnabled: input.settings.thinkingEnabled,
    }),
    user: cloneUserSnapshot(input.user),
  };

  return Object.freeze(snapshot);
}
