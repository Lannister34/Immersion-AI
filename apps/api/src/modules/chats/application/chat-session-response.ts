import {
  type ChatGenerationSettingsDto,
  type ChatSummaryDto,
  type GetChatSessionResponse,
  GetChatSessionResponseSchema,
} from '@immersion/contracts/chats';

import type { ChatGenerationSettingsRecord, ChatSessionRecord, ChatSummaryRecord } from './chat-records.js';
import { getDefaultUserName } from './default-user-name.js';

function buildCharacterAvatarUrl(characterId: string | null): string | null {
  if (!characterId) return null;
  if (!characterId.toLowerCase().endsWith('.png')) return null;
  return `/api/characters/${encodeURIComponent(characterId)}/avatar`;
}

export function toChatSummaryDto(summary: ChatSummaryRecord): ChatSummaryDto {
  return {
    characterAvatarUrl: buildCharacterAvatarUrl(summary.characterId),
    characterId: summary.characterId,
    characterName: summary.characterName,
    createdAt: summary.createdAt,
    id: summary.id,
    lastMessagePreview: summary.lastMessagePreview,
    lorebookIds: [...summary.lorebookIds],
    messageCount: summary.messageCount,
    scenarioId: summary.scenarioId,
    scenarioName: summary.scenarioName,
    title: summary.title,
    updatedAt: summary.updatedAt,
  };
}

function toChatGenerationSettingsDto(settings: ChatGenerationSettingsRecord): ChatGenerationSettingsDto {
  return {
    additionalInstructions: settings.additionalInstructions,
    samplerPresetId: settings.samplerPresetId,
    sampling: {
      contextTrimStrategy: settings.sampling.contextTrimStrategy,
      maxContextLength: settings.sampling.maxContextLength,
      maxTokens: settings.sampling.maxTokens,
      minP: settings.sampling.minP,
      presencePenalty: settings.sampling.presencePenalty,
      repeatPenalty: settings.sampling.repeatPenalty,
      repeatPenaltyRange: settings.sampling.repeatPenaltyRange,
      temperature: settings.sampling.temperature,
      topK: settings.sampling.topK,
      topP: settings.sampling.topP,
    },
    systemPrompt: settings.systemPrompt,
  };
}

export function toChatSessionResponse(session: ChatSessionRecord): GetChatSessionResponse {
  const summaryDto = toChatSummaryDto(session.chat);
  return GetChatSessionResponseSchema.parse({
    characterAvatarUrl: summaryDto.characterAvatarUrl,
    characterId: session.characterId,
    characterName: session.characterName,
    scenarioId: session.scenarioId,
    scenarioName: session.scenarioName,
    lorebookIds: [...session.lorebookIds],
    chat: summaryDto,
    generationSettings: toChatGenerationSettingsDto(session.generationSettings),
    messages: session.messages,
    userName: session.userName ?? getDefaultUserName(),
  });
}
