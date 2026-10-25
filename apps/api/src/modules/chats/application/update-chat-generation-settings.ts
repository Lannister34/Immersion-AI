import {
  type UpdateChatGenerationSettingsCommand,
  type UpdateChatGenerationSettingsResponse,
  UpdateChatGenerationSettingsResponseSchema,
} from '@immersion/contracts/chats';
import { type ReplyBudgetSettings, replyLimitExceedsContext } from '@immersion/domain/prompting';

import { getSettingsOverview, ReplyLimitExceedsContextError } from '../../settings/index.js';
import { FileChatRepository } from '../infrastructure/file-chat-repository.js';
import { ChatNotFoundError } from './append-chat-messages.js';
import type { ChatGenerationSettingsRecord } from './chat-records.js';
import { toChatSessionResponse } from './chat-session-response.js';

export class InvalidChatGenerationSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidChatGenerationSettingsError';
  }
}

function findChatSamplerPreset(presetId: string | null): ReplyBudgetSettings | null {
  if (!presetId) {
    return null;
  }

  const settings = getSettingsOverview();
  const preset = settings.sampler.presets.find((entry) => entry.id === presetId);

  if (!preset) {
    throw new InvalidChatGenerationSettingsError(`Sampler preset not found: ${presetId}`);
  }

  return preset;
}

function impossibleReplyBudget(
  sampling: UpdateChatGenerationSettingsCommand['sampling'],
  chatPreset: ReplyBudgetSettings | null,
): ReplyBudgetSettings | null {
  if (sampling.maxContextLength === null && sampling.maxTokens === null) {
    return null;
  }

  const maxContextLength = sampling.maxContextLength ?? chatPreset?.maxContextLength ?? null;
  const maxTokens = sampling.maxTokens ?? chatPreset?.maxTokens ?? null;

  if (maxContextLength === null || maxTokens === null) {
    return null;
  }

  const settings = { maxContextLength, maxTokens };

  return replyLimitExceedsContext(settings) ? settings : null;
}

function keepsReplyBudgetFields(current: ChatGenerationSettingsRecord, next: ChatGenerationSettingsRecord): boolean {
  return (
    current.samplerPresetId === next.samplerPresetId &&
    current.sampling.maxContextLength === next.sampling.maxContextLength &&
    current.sampling.maxTokens === next.sampling.maxTokens
  );
}

function toChatGenerationSettingsRecord(command: UpdateChatGenerationSettingsCommand): ChatGenerationSettingsRecord {
  return {
    additionalInstructions: command.additionalInstructions,
    samplerPresetId: command.samplerPresetId,
    sampling: {
      contextTrimStrategy: command.sampling.contextTrimStrategy,
      maxContextLength: command.sampling.maxContextLength,
      maxTokens: command.sampling.maxTokens,
      minP: command.sampling.minP,
      presencePenalty: command.sampling.presencePenalty,
      repeatPenalty: command.sampling.repeatPenalty,
      repeatPenaltyRange: command.sampling.repeatPenaltyRange,
      temperature: command.sampling.temperature,
      topK: command.sampling.topK,
      topP: command.sampling.topP,
    },
    systemPrompt: command.systemPrompt,
  };
}

export async function updateChatGenerationSettings(
  chatId: string,
  command: UpdateChatGenerationSettingsCommand,
): Promise<UpdateChatGenerationSettingsResponse> {
  const impossibleBudget = impossibleReplyBudget(command.sampling, findChatSamplerPreset(command.samplerPresetId));
  const nextSettings = toChatGenerationSettingsRecord(command);
  const chatRepository = new FileChatRepository();
  const session = await chatRepository.updateGenericChatGenerationSettings(
    chatId,
    nextSettings,
    new Date().toISOString(),
    {
      assertWritable: (current) => {
        if (impossibleBudget && !keepsReplyBudgetFields(current, nextSettings)) {
          throw new ReplyLimitExceedsContextError(impossibleBudget);
        }
      },
    },
  );

  if (!session) {
    throw new ChatNotFoundError(chatId);
  }

  return UpdateChatGenerationSettingsResponseSchema.parse(toChatSessionResponse(session));
}
