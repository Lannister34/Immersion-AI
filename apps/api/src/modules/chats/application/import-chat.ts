import crypto from 'node:crypto';

import { type ImportChatCommand, type ImportChatResponse, ImportChatResponseSchema } from '@immersion/contracts/chats';

import { FileChatRepository, parseChatTranscriptLeniently } from '../infrastructure/file-chat-repository.js';
import { createDefaultChatGenerationSettings } from './chat-records.js';
import { toChatSummaryDto } from './chat-session-response.js';
import { getDefaultUserName } from './default-user-name.js';

export const MAX_CHAT_IMPORT_BYTES = 10 * 1024 * 1024;

const DEFAULT_IMPORTED_CHAT_TITLE = 'Импортированный чат';

export class InvalidChatFileError extends Error {
  constructor() {
    super('No valid chat messages found in the uploaded file.');
    this.name = 'InvalidChatFileError';
  }
}

export class ChatFileTooLargeError extends Error {
  constructor() {
    super('Uploaded chat file exceeds the 10 MB limit.');
    this.name = 'ChatFileTooLargeError';
  }
}

export async function importChat(command: ImportChatCommand): Promise<ImportChatResponse> {
  const decoded = Buffer.from(command.contentBase64, 'base64');
  if (decoded.length > MAX_CHAT_IMPORT_BYTES) {
    throw new ChatFileTooLargeError();
  }

  const importedAt = new Date().toISOString();
  const transcript = parseChatTranscriptLeniently(decoded.toString('utf8'), 'imported chat file', importedAt);

  if (transcript.messages.length === 0) {
    throw new InvalidChatFileError();
  }

  // Deliberately not binding characterId/scenarioId: imported names may not
  // exist locally, so the header names are preserved as display names only.
  // Lorebook ids are kept as-is: a missing lorebook is inert at prompt time.
  const chatRepository = new FileChatRepository();
  const summary = await chatRepository.createGenericChat({
    characterName: transcript.header?.characterName ?? null,
    createdAt: transcript.header?.createdAt ?? importedAt,
    generationSettings: transcript.header?.generationSettings ?? createDefaultChatGenerationSettings(),
    id: crypto.randomUUID(),
    lorebookIds: transcript.header?.lorebookIds ?? [],
    scenarioName: transcript.header?.scenarioName ?? null,
    seedMessages: transcript.messages,
    title: command.title?.trim() || transcript.header?.title || DEFAULT_IMPORTED_CHAT_TITLE,
    userName: transcript.header?.userName ?? getDefaultUserName(),
  });

  return ImportChatResponseSchema.parse({
    chat: toChatSummaryDto(summary),
    importedMessages: transcript.messages.length,
    skippedLines: transcript.skippedLines,
  });
}
