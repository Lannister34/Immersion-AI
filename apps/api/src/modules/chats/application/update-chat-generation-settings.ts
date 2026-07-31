import {
  type UpdateChatGenerationSettingsCommand,
  UpdateChatGenerationSettingsCommandSchema,
  type UpdateChatGenerationSettingsResponse,
  UpdateChatGenerationSettingsResponseSchema,
} from '@immersion/contracts/chats';

import { getSettingsOverview } from '../../settings/application/get-settings-overview.js';
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

function assertSamplerPresetExists(presetId: string | null) {
  if (!presetId) {
    return;
  }

  const settings = getSettingsOverview();
  const exists = settings.sampler.presets.some((preset) => preset.id === presetId);

  if (!exists) {
    throw new InvalidChatGenerationSettingsError(`Sampler preset not found: ${presetId}`);
  }
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
  input: unknown,
): Promise<UpdateChatGenerationSettingsResponse> {
  const command: UpdateChatGenerationSettingsCommand = UpdateChatGenerationSettingsCommandSchema.parse(input);
  assertSamplerPresetExists(command.samplerPresetId);
  const chatRepository = new FileChatRepository();
  const session = await chatRepository.updateGenericChatGenerationSettings(
    chatId,
    toChatGenerationSettingsRecord(command),
    new Date().toISOString(),
  );

  if (!session) {
    throw new ChatNotFoundError(chatId);
  }

  return UpdateChatGenerationSettingsResponseSchema.parse(toChatSessionResponse(session));
}
