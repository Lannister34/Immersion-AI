import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import type { PromptCharacterSnapshot } from '@immersion/domain/prompting';

import type { ActiveSamplerPreset } from '../../settings/application/active-sampler-preset.js';
import { assembleBasePrompt, type BasePromptAssemblyResult } from './assemble-base-prompt.js';
import { buildPromptInputSnapshot, type PromptTranscriptRole } from './prompt-input-snapshot.js';
import { countTokensHeuristic, type TokenCounter, type TokenCountMethod } from './token-counter.js';

export type ChatReplyPromptRole = 'assistant' | 'system' | 'user';

export interface ChatReplyPromptMessage {
  content: string;
  images?: string[];
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
  tokenCountMethod: TokenCountMethod;
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
  messageImages?: ReadonlyMap<string, string[]>;
  trailingUserInstruction?: string | null;
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

export function promptMessageTokenText(message: ChatReplyPromptMessage): string {
  return `${message.role}\n${message.content}`;
}

interface CountedPromptMessage {
  message: ChatReplyPromptMessage;
  tokens: number;
}

function sumTokens(messages: CountedPromptMessage[]) {
  return messages.reduce((total, counted) => total + counted.tokens, 0);
}

function toMessages(counted: CountedPromptMessage[]) {
  return counted.map((entry) => entry.message);
}

function trimFromStart(messages: CountedPromptMessage[], tokenBudget: number, pinnedTailCount: number) {
  const keptMessages: CountedPromptMessage[] = [];
  let remainingTokens = tokenBudget;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const counted = messages[index]!;

    if (keptMessages.length >= pinnedTailCount && counted.tokens > remainingTokens) {
      break;
    }

    keptMessages.push(counted);
    remainingTokens -= counted.tokens;
  }

  return keptMessages.reverse();
}

function trimFromMiddle(messages: CountedPromptMessage[], tokenBudget: number, pinnedTailCount: number) {
  if (messages.length <= pinnedTailCount) {
    return messages;
  }

  const keptIndexes = new Set<number>();
  const firstPinnedIndex = messages.length - pinnedTailCount;
  let remainingTokens = tokenBudget;

  for (let index = firstPinnedIndex; index < messages.length; index += 1) {
    keptIndexes.add(index);
    remainingTokens -= messages[index]!.tokens;
  }

  let leftIndex = 0;
  let rightIndex = firstPinnedIndex - 1;
  let takeLeft = true;

  while (leftIndex <= rightIndex) {
    const candidateIndex = takeLeft ? leftIndex : rightIndex;
    const candidate = messages[candidateIndex]!;

    if (candidate.tokens > remainingTokens) {
      break;
    }

    keptIndexes.add(candidateIndex);
    remainingTokens -= candidate.tokens;

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
  countedMessages: CountedPromptMessage[],
  samplerPreset: ActiveSamplerPreset,
  pinnedTailCount: number,
): {
  messages: ChatReplyPromptMessage[];
  tokenEstimate: ChatReplyPromptTokenEstimate;
  trimmedMessageCount: number;
} {
  const systemMessages = countedMessages.filter((counted) => counted.message.role === 'system');
  const transcriptMessages = countedMessages.filter((counted) => counted.message.role !== 'system');
  const systemTokens = sumTokens(systemMessages);
  const transcriptBeforeTrimTokens = sumTokens(transcriptMessages);
  const promptBudget =
    samplerPreset.maxContextLength <= 0 ? 0 : Math.max(1, samplerPreset.maxContextLength - samplerPreset.maxTokens);

  if (samplerPreset.maxContextLength <= 0) {
    const trimmedMessages = countedMessages.slice(-pinnedTailCount);
    const transcriptAfterTrimTokens = sumTokens(trimmedMessages.filter((counted) => counted.message.role !== 'system'));

    return {
      messages: toMessages(trimmedMessages),
      tokenEstimate: {
        finalTotal: sumTokens(trimmedMessages),
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
      messages: toMessages(countedMessages),
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
      ? trimFromStart(transcriptMessages, transcriptBudget, pinnedTailCount)
      : trimFromMiddle(transcriptMessages, transcriptBudget, pinnedTailCount);
  const trimmedMessages = [...systemMessages, ...trimmedTranscript];
  const transcriptAfterTrimTokens = sumTokens(trimmedTranscript);

  return {
    messages: toMessages(trimmedMessages),
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

function resolveDefaultSystemPromptTemplate(
  shouldUseContextualPromptSettings: boolean,
  character: PromptCharacterSnapshot | null,
): string {
  if (!shouldUseContextualPromptSettings) {
    return EMPTY_SYSTEM_PROMPT_TEMPLATE;
  }

  return character !== null ? CHARACTER_SYSTEM_PROMPT_TEMPLATE : DEFAULT_SYSTEM_PROMPT_TEMPLATE;
}

interface UntrimmedChatReplyPrompt {
  basePrompt: BasePromptAssemblyResult;
  messages: ChatReplyPromptMessage[];
}

function buildUntrimmedChatReplyPrompt(input: BuildChatReplyPromptInput): UntrimmedChatReplyPrompt {
  const activePreset = input.samplerPreset;
  const character = input.character ?? null;
  const shouldUseContextualPromptSettings = character !== null || isContextualChat(input.session);
  const defaultSystemPromptTemplate = resolveDefaultSystemPromptTemplate(shouldUseContextualPromptSettings, character);
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
  const isManualSystemPrompt = basePrompt.source.kind === 'chat-override';
  const systemSections = (
    isManualSystemPrompt
      ? [basePrompt.prompt]
      : [
          characterContext,
          lorebookContext.length > 0 ? `World context:\n${lorebookContext}` : null,
          basePrompt.prompt,
          languageInstruction,
          input.session.generationSettings.additionalInstructions,
        ]
  ).filter((section): section is string => section !== null && section.trim().length > 0);
  const messages: ChatReplyPromptMessage[] = [];

  if (systemSections.length > 0) {
    messages.push({
      role: 'system',
      content: systemSections.join('\n\n'),
    });
  }

  for (const message of input.session.messages) {
    const images = input.messageImages?.get(message.id) ?? [];

    if (message.content.trim().length === 0 && images.length === 0) {
      continue;
    }

    messages.push({
      role: message.role,
      content: message.content,
      ...(images.length > 0 ? { images } : {}),
    });
  }

  const trailingUserInstruction = input.trailingUserInstruction?.trim();

  if (trailingUserInstruction) {
    messages.push({
      role: 'user',
      content: trailingUserInstruction,
    });
  }

  return { basePrompt, messages };
}

function toBudgetedBundle(
  input: BuildChatReplyPromptInput,
  untrimmed: UntrimmedChatReplyPrompt,
  counts: number[],
  tokenCountMethod: TokenCountMethod,
): ChatReplyPromptBundle {
  const fallbackCounts = countTokensHeuristic(untrimmed.messages.map(promptMessageTokenText)).counts;
  const countedMessages = untrimmed.messages.map((message, index) => ({
    message,
    tokens: counts[index] ?? fallbackCounts[index] ?? 1,
  }));
  const pinnedTailCount = input.trailingUserInstruction?.trim() ? 2 : 1;
  const budgetedPrompt = trimTranscriptToContextBudget(countedMessages, input.samplerPreset, pinnedTailCount);

  return {
    diagnostics: {
      promptSource: untrimmed.basePrompt.source,
      renderer: untrimmed.basePrompt.diagnostics,
      tokenCountMethod,
      tokenEstimate: budgetedPrompt.tokenEstimate,
      trimmedMessageCount: budgetedPrompt.trimmedMessageCount,
    },
    messages: budgetedPrompt.messages,
  };
}

export function buildChatReplyPromptBundle(input: BuildChatReplyPromptInput): ChatReplyPromptBundle {
  const untrimmed = buildUntrimmedChatReplyPrompt(input);
  const { counts, method } = countTokensHeuristic(untrimmed.messages.map(promptMessageTokenText));

  return toBudgetedBundle(input, untrimmed, counts, method);
}

export async function buildChatReplyPromptBundleWithTokenCounter(
  input: BuildChatReplyPromptInput,
  tokenCounter: TokenCounter,
): Promise<ChatReplyPromptBundle> {
  const untrimmed = buildUntrimmedChatReplyPrompt(input);
  const { counts, method } = await tokenCounter.countTokens(untrimmed.messages.map(promptMessageTokenText));

  return toBudgetedBundle(input, untrimmed, counts, method);
}

export function buildChatReplyPrompt(input: BuildChatReplyPromptInput): ChatReplyPromptMessage[] {
  return buildChatReplyPromptBundle(input).messages;
}
