import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import type { PromptCharacterSnapshot } from '@immersion/domain/prompting';

import type { ActiveSamplerPreset } from '../../settings/application/active-sampler-preset.js';
import { assembleBasePrompt, type BasePromptAssemblyResult } from './assemble-base-prompt.js';
import { buildPromptInputSnapshot, type PromptTranscriptRole } from './prompt-input-snapshot.js';

export type ChatReplyPromptRole = 'assistant' | 'system' | 'user';

export interface ChatReplyPromptMessage {
  content: string;
  role: ChatReplyPromptRole;
}

export interface ChatReplyPromptTokenEstimate {
  finalTotal: number;
  promptBudget: number;
  replyReservation: number;
  system: number;
  transcriptAfterTrim: number;
  transcriptBeforeTrim: number;
}

export interface ChatReplyPromptDiagnostics {
  promptSource: BasePromptAssemblyResult['source'];
  renderer: BasePromptAssemblyResult['diagnostics'];
  tokenEstimate: ChatReplyPromptTokenEstimate;
  trimmedMessageCount: number;
}

export interface ChatReplyPromptBundle {
  diagnostics: ChatReplyPromptDiagnostics;
  messages: ChatReplyPromptMessage[];
}

export interface BuildChatReplyPromptInput {
  character?: PromptCharacterSnapshot | null;
  characterScenarioContent?: string | null;
  lorebookSections?: string[];
  samplerPreset: ActiveSamplerPreset;
  session: ChatSessionDto;
  settings: SettingsOverviewResponse;
}

const DEFAULT_SYSTEM_PROMPT_TEMPLATE =
  'You are a helpful local assistant. Answer the user directly and keep the conversation coherent.';
const CHARACTER_SYSTEM_PROMPT_TEMPLATE = [
  'You are {{character.name}}, a character in an immersive role-play with {{user.name}}.',
  '{{character.description}}',
  '{{character.personality}}',
  '{{scenario.content}}',
  '{{user.persona}}',
  'Stay fully in character as {{character.name}}. Reply in first person, in the same language as the user, and never refer to yourself as an AI or assistant.',
].join('\n\n');
const EMPTY_SYSTEM_PROMPT_TEMPLATE = '';

function isContextualChat(session: ChatSessionDto) {
  return session.characterName !== null || session.chat.characterName !== null;
}

function buildCharacterContextSection(
  character: PromptCharacterSnapshot | null,
  scenarioContent: string | null,
): string | null {
  if (!character) return null;

  const lines: string[] = [`You are ${character.name}.`];
  const description = character.description?.trim();
  if (description) {
    lines.push(`Description:\n${description}`);
  }
  const personality = character.personality?.trim();
  if (personality) {
    lines.push(`Personality:\n${personality}`);
  }
  const scenario = scenarioContent?.trim();
  if (scenario) {
    lines.push(`Scenario:\n${scenario}`);
  }
  const example = character.mesExample?.trim();
  if (example) {
    lines.push(`Example dialogue:\n${example}`);
  }

  return lines.join('\n\n');
}

function toPromptTranscriptRole(role: ChatSessionDto['messages'][number]['role']): PromptTranscriptRole {
  return role;
}

function getLanguageInstruction(responseLanguage: SettingsOverviewResponse['profile']['responseLanguage']) {
  if (responseLanguage === 'ru') {
    return 'Answer in Russian unless the user explicitly asks for another language.';
  }

  if (responseLanguage === 'en') {
    return 'Answer in English unless the user explicitly asks for another language.';
  }

  return null;
}

function estimatePromptTokens(message: ChatReplyPromptMessage) {
  return Math.max(1, Math.ceil(`${message.role}\n${message.content}`.length / 4));
}

function estimateMessages(messages: ChatReplyPromptMessage[]) {
  return messages.reduce((total, message) => total + estimatePromptTokens(message), 0);
}

function trimFromStart(messages: ChatReplyPromptMessage[], tokenBudget: number) {
  const keptMessages: ChatReplyPromptMessage[] = [];
  let remainingTokens = tokenBudget;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    const estimatedTokens = estimatePromptTokens(message);

    if (keptMessages.length > 0 && estimatedTokens > remainingTokens) {
      break;
    }

    keptMessages.push(message);
    remainingTokens -= estimatedTokens;
  }

  return keptMessages.reverse();
}

function trimFromMiddle(messages: ChatReplyPromptMessage[], tokenBudget: number) {
  if (messages.length <= 1) {
    return messages;
  }

  const keptIndexes = new Set<number>();
  const latestIndex = messages.length - 1;
  let remainingTokens = tokenBudget - estimatePromptTokens(messages[latestIndex]!);

  keptIndexes.add(latestIndex);

  let leftIndex = 0;
  let rightIndex = latestIndex - 1;
  let takeLeft = true;

  while (leftIndex <= rightIndex) {
    const candidateIndex = takeLeft ? leftIndex : rightIndex;
    const candidate = messages[candidateIndex]!;
    const estimatedTokens = estimatePromptTokens(candidate);

    if (estimatedTokens > remainingTokens) {
      break;
    }

    keptIndexes.add(candidateIndex);
    remainingTokens -= estimatedTokens;

    if (takeLeft) {
      leftIndex += 1;
    } else {
      rightIndex -= 1;
    }

    takeLeft = !takeLeft;
  }

  return messages.filter((_, index) => keptIndexes.has(index));
}

function trimTranscriptToContextBudget(
  messages: ChatReplyPromptMessage[],
  samplerPreset: ActiveSamplerPreset,
): {
  messages: ChatReplyPromptMessage[];
  tokenEstimate: ChatReplyPromptTokenEstimate;
  trimmedMessageCount: number;
} {
  const systemMessages = messages.filter((message) => message.role === 'system');
  const transcriptMessages = messages.filter((message) => message.role !== 'system');
  const systemTokens = estimateMessages(systemMessages);
  const transcriptBeforeTrimTokens = estimateMessages(transcriptMessages);
  const promptBudget =
    samplerPreset.maxContextLength <= 0 ? 0 : Math.max(1, samplerPreset.maxContextLength - samplerPreset.maxTokens);

  if (samplerPreset.maxContextLength <= 0) {
    const latestMessage = messages.at(-1);
    const trimmedMessages = latestMessage ? [latestMessage] : [];
    const transcriptAfterTrimTokens = estimateMessages(trimmedMessages.filter((message) => message.role !== 'system'));

    return {
      messages: trimmedMessages,
      tokenEstimate: {
        finalTotal: estimateMessages(trimmedMessages),
        promptBudget,
        replyReservation: samplerPreset.maxTokens,
        system: 0,
        transcriptAfterTrim: transcriptAfterTrimTokens,
        transcriptBeforeTrim: transcriptBeforeTrimTokens,
      },
      trimmedMessageCount: Math.max(0, transcriptMessages.length - trimmedMessages.length),
    };
  }

  const totalEstimatedTokens = systemTokens + transcriptBeforeTrimTokens;

  if (totalEstimatedTokens <= promptBudget) {
    return {
      messages,
      tokenEstimate: {
        finalTotal: totalEstimatedTokens,
        promptBudget,
        replyReservation: samplerPreset.maxTokens,
        system: systemTokens,
        transcriptAfterTrim: transcriptBeforeTrimTokens,
        transcriptBeforeTrim: transcriptBeforeTrimTokens,
      },
      trimmedMessageCount: 0,
    };
  }

  const transcriptBudget = Math.max(1, promptBudget - systemTokens);
  const trimmedTranscript =
    samplerPreset.contextTrimStrategy === 'trim_start'
      ? trimFromStart(transcriptMessages, transcriptBudget)
      : trimFromMiddle(transcriptMessages, transcriptBudget);
  const trimmedMessages = [...systemMessages, ...trimmedTranscript];
  const transcriptAfterTrimTokens = estimateMessages(trimmedTranscript);

  return {
    messages: trimmedMessages,
    tokenEstimate: {
      finalTotal: systemTokens + transcriptAfterTrimTokens,
      promptBudget,
      replyReservation: samplerPreset.maxTokens,
      system: systemTokens,
      transcriptAfterTrim: transcriptAfterTrimTokens,
      transcriptBeforeTrim: transcriptBeforeTrimTokens,
    },
    trimmedMessageCount: transcriptMessages.length - trimmedTranscript.length,
  };
}

export function buildChatReplyPromptBundle(input: BuildChatReplyPromptInput): ChatReplyPromptBundle {
  const activePreset = input.samplerPreset;
  const character = input.character ?? null;
  const shouldUseContextualPromptSettings = character !== null || isContextualChat(input.session);
  const defaultSystemPromptTemplate = !shouldUseContextualPromptSettings
    ? EMPTY_SYSTEM_PROMPT_TEMPLATE
    : character !== null
      ? CHARACTER_SYSTEM_PROMPT_TEMPLATE
      : DEFAULT_SYSTEM_PROMPT_TEMPLATE;
  const snapshot = buildPromptInputSnapshot({
    ...(character ? { character } : {}),
    ...(input.characterScenarioContent ? { scenario: { content: input.characterScenarioContent, name: null } } : {}),
    chat: {
      customSystemPrompt: input.session.generationSettings.systemPrompt,
      id: input.session.chat.id,
      title: input.session.chat.title,
      transcript: input.session.messages.map((message) => ({
        content: message.content,
        id: message.id,
        role: toPromptTranscriptRole(message.role),
      })),
    },
    generation: {
      maxContextTokens: activePreset.maxContextLength,
      replyMaxTokens: activePreset.maxTokens,
      trimStrategy: activePreset.contextTrimStrategy,
    },
    settings: {
      defaultSystemPromptTemplate,
      responseLanguage: shouldUseContextualPromptSettings ? input.settings.profile.responseLanguage : 'none',
      systemPromptTemplate: shouldUseContextualPromptSettings
        ? input.settings.profile.systemPromptTemplate.trim() || null
        : null,
      thinkingEnabled: input.settings.profile.thinkingEnabled,
    },
    user: {
      name: input.session.userName,
      persona: shouldUseContextualPromptSettings ? input.settings.profile.userPersona : null,
    },
  });
  const basePrompt = assembleBasePrompt(snapshot);
  const languageInstruction = shouldUseContextualPromptSettings
    ? getLanguageInstruction(input.settings.profile.responseLanguage)
    : null;
  const characterContext = buildCharacterContextSection(character, input.characterScenarioContent ?? null);
  const lorebookContext = (input.lorebookSections ?? [])
    .map((section) => section.trim())
    .filter((section) => section.length > 0)
    .join('\n\n');
  const systemSections = [
    characterContext,
    lorebookContext.length > 0 ? `World context:\n${lorebookContext}` : null,
    basePrompt.prompt,
    languageInstruction,
  ].filter((section): section is string => section !== null && section.trim().length > 0);
  const messages: ChatReplyPromptMessage[] = [];

  if (systemSections.length > 0) {
    messages.push({
      role: 'system',
      content: systemSections.join('\n\n'),
    });
  }

  for (const message of input.session.messages) {
    if (message.content.trim().length === 0) {
      continue;
    }

    messages.push({
      role: message.role,
      content: message.content,
    });
  }

  const budgetedPrompt = trimTranscriptToContextBudget(messages, activePreset);

  return {
    diagnostics: {
      promptSource: basePrompt.source,
      renderer: basePrompt.diagnostics,
      tokenEstimate: budgetedPrompt.tokenEstimate,
      trimmedMessageCount: budgetedPrompt.trimmedMessageCount,
    },
    messages: budgetedPrompt.messages,
  };
}

export function buildChatReplyPrompt(input: BuildChatReplyPromptInput): ChatReplyPromptMessage[] {
  return buildChatReplyPromptBundle(input).messages;
}
