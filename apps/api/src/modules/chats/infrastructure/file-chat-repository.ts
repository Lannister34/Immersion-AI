import fs from 'node:fs/promises';
import path from 'node:path';

import { ChatGenerationSettingsDtoSchema } from '@immersion/contracts/chats';

import { writeFileAtomically } from '../../../lib/atomic-file.js';
import { resolveContainedFilePath } from '../../../lib/contained-path.js';
import { resolveDataRoot } from '../../../lib/data-root.js';
import {
  ChatLastMessageChangedError,
  ChatTitleConflictError,
  ChatTranscriptNotEmptyError,
} from '../application/chat-conflicts.js';
import type { ChatFileStatRecord, ChatSummaryWithSearchText } from '../application/chat-read-model.js';
import type {
  AppendChatMessageInput,
  ChatGenerationSettingsRecord,
  ChatMessageAttachmentRecord,
  ChatMessageRecord,
  ChatMessageRoleRecord,
  ChatSessionRecord,
  ChatSummaryRecord,
  CreateGenericChatInput,
} from '../application/chat-records.js';
import {
  createDefaultChatGenerationSettings,
  createDefaultChatSamplingOverrides,
} from '../application/chat-records.js';
import type {
  AppendContinuationToLastAssistantMessageInput,
  ChatRepository,
  ForkGenericChatInput,
  ListGenericChatsOptions,
} from '../application/chat-repository.js';
import { joinContinuationContent } from '../application/continuation-content.js';
import { deriveLastMessagePreview } from '../application/last-message-preview.js';

// MVP scope: rewrite chats are generic-only until the character-backed slice lands.
const GENERIC_CHAT_DIRECTORY = '_no_character_';
const chatWriteQueues = new Map<string, Promise<unknown>>();
const DEFAULT_CHAT_TITLE_PREFIX = 'Новый чат';

interface StoredChatMetadata {
  createdAt?: string;
  title?: string;
  updatedAt?: string;
}

interface StoredChatHeader {
  chat_metadata?: StoredChatMetadata;
  character_id?: string;
  character_name?: string;
  scenario_id?: string;
  scenario_name?: string;
  lorebook_ids?: string[];
  generation_settings?: StoredChatGenerationSettings;
  user_name?: string;
}

interface StoredChatSamplingOverrides {
  context_trim_strategy?: unknown;
  max_context_length?: unknown;
  max_length?: unknown;
  min_p?: unknown;
  presence_penalty?: unknown;
  rep_pen?: unknown;
  rep_pen_range?: unknown;
  temperature?: unknown;
  top_k?: unknown;
  top_p?: unknown;
}

interface StoredChatGenerationSettings {
  additional_instructions?: unknown;
  sampler_preset_id?: unknown;
  sampling?: StoredChatSamplingOverrides;
  system_prompt?: unknown;
}

interface StoredChatAttachment {
  file?: unknown;
  mime?: unknown;
}

interface StoredChatLine {
  extra?: unknown;
  is_user?: boolean;
  mes?: string;
  send_date?: string;
}

function getString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function getNullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === 'string' ? value : null;
}

function getNullableNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function resolveChatsDirectory() {
  return path.join(resolveDataRoot(), 'chats', GENERIC_CHAT_DIRECTORY);
}

function resolveChatFilePath(chatId: string) {
  return path.join(resolveChatsDirectory(), `${chatId}.jsonl`);
}

/** Вложения лежат в папке рядом с файлом чата и уходят вместе с ним. */
function resolveChatAttachmentsDirectory(chatId: string) {
  return path.join(resolveChatsDirectory(), `${chatId}.files`);
}

function resolveChatAttachmentPath(chatId: string, attachmentId: string) {
  return resolveContainedFilePath(resolveChatAttachmentsDirectory(chatId), attachmentId);
}

export async function writeChatAttachmentFile(chatId: string, attachmentId: string, bytes: Buffer): Promise<void> {
  const directory = resolveChatAttachmentsDirectory(chatId);
  await fs.mkdir(directory, { recursive: true });
  await writeFileAtomically(resolveChatAttachmentPath(chatId, attachmentId), bytes);
}

export async function readChatAttachmentFile(chatId: string, attachmentId: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(resolveChatAttachmentPath(chatId, attachmentId));
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function deleteChatAttachmentFiles(chatId: string): Promise<void> {
  await fs.rm(resolveChatAttachmentsDirectory(chatId), { force: true, recursive: true });
}

async function withChatWriteQueue<T>(chatId: string, operation: () => Promise<T>): Promise<T> {
  const previous = chatWriteQueues.get(chatId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);

  chatWriteQueues.set(chatId, next);

  try {
    return await next;
  } finally {
    if (chatWriteQueues.get(chatId) === next) {
      chatWriteQueues.delete(chatId);
    }
  }
}

function parseJsonRecord(line: string, filePath: string, lineNumber: number) {
  if (!line.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(line) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`Malformed chat file: ${filePath}:${lineNumber}`);
  }
}

function parseStoredGenerationSettings(value: unknown, filePath: string): ChatGenerationSettingsRecord {
  if (value === null || value === undefined) {
    return createDefaultChatGenerationSettings();
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Malformed chat generation settings: ${filePath}:1`);
  }

  const source = value as StoredChatGenerationSettings;
  const samplingSource =
    source.sampling && typeof source.sampling === 'object' && !Array.isArray(source.sampling) ? source.sampling : {};
  const parsed = ChatGenerationSettingsDtoSchema.safeParse({
    additionalInstructions: getNullableString(source.additional_instructions),
    samplerPresetId: getNullableString(source.sampler_preset_id),
    sampling: {
      ...createDefaultChatSamplingOverrides(),
      contextTrimStrategy:
        samplingSource.context_trim_strategy === 'trim_start' || samplingSource.context_trim_strategy === 'trim_middle'
          ? samplingSource.context_trim_strategy
          : null,
      maxContextLength: getNullableNumber(samplingSource.max_context_length),
      maxTokens: getNullableNumber(samplingSource.max_length),
      minP: getNullableNumber(samplingSource.min_p),
      presencePenalty: getNullableNumber(samplingSource.presence_penalty),
      repeatPenalty: getNullableNumber(samplingSource.rep_pen),
      repeatPenaltyRange: getNullableNumber(samplingSource.rep_pen_range),
      temperature: getNullableNumber(samplingSource.temperature),
      topK: getNullableNumber(samplingSource.top_k),
      topP: getNullableNumber(samplingSource.top_p),
    },
    systemPrompt: getNullableString(source.system_prompt),
  });

  if (!parsed.success) {
    throw new Error(`Malformed chat generation settings: ${filePath}:1`);
  }

  return parsed.data;
}

function serializeGenerationSettings(settings: ChatGenerationSettingsRecord): StoredChatGenerationSettings {
  return {
    additional_instructions: settings.additionalInstructions,
    sampler_preset_id: settings.samplerPresetId,
    sampling: {
      context_trim_strategy: settings.sampling.contextTrimStrategy,
      max_context_length: settings.sampling.maxContextLength,
      max_length: settings.sampling.maxTokens,
      min_p: settings.sampling.minP,
      presence_penalty: settings.sampling.presencePenalty,
      rep_pen: settings.sampling.repeatPenalty,
      rep_pen_range: settings.sampling.repeatPenaltyRange,
      temperature: settings.sampling.temperature,
      top_k: settings.sampling.topK,
      top_p: settings.sampling.topP,
    },
    system_prompt: settings.systemPrompt,
  };
}

function parseStoredHeader(line: string, filePath: string) {
  const parsed = parseJsonRecord(line, filePath, 1);
  if (!parsed) {
    return null;
  }

  if (!('chat_metadata' in parsed) && !('user_name' in parsed) && !('character_name' in parsed)) {
    return null;
  }

  const metadataSource =
    parsed.chat_metadata && typeof parsed.chat_metadata === 'object' && !Array.isArray(parsed.chat_metadata)
      ? (parsed.chat_metadata as Record<string, unknown>)
      : {};

  const generationSettings = parseStoredGenerationSettings(parsed.generation_settings, filePath);

  const storedLorebookIds = Array.isArray(parsed.lorebook_ids)
    ? parsed.lorebook_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];

  return {
    chat_metadata: {
      createdAt: getString(metadataSource.createdAt),
      title: getString(metadataSource.title),
      updatedAt: getString(metadataSource.updatedAt),
    },
    character_id: getString(parsed.character_id),
    character_name: getString(parsed.character_name),
    scenario_id: getString(parsed.scenario_id),
    scenario_name: getString(parsed.scenario_name),
    lorebook_ids: storedLorebookIds,
    generation_settings: serializeGenerationSettings(generationSettings),
    user_name: getString(parsed.user_name),
  } satisfies StoredChatHeader;
}

function parseStoredHeaderRecord(line: string, filePath: string) {
  const parsed = parseJsonRecord(line, filePath, 1);
  if (!parsed) {
    return null;
  }

  if (!('chat_metadata' in parsed) && !('user_name' in parsed) && !('character_name' in parsed)) {
    return null;
  }

  return parsed;
}

function parseStoredChatLine(line: string, filePath: string, lineNumber: number) {
  const parsed = parseJsonRecord(line, filePath, lineNumber);
  if (!parsed) {
    return null;
  }
  if ('chat_metadata' in parsed) {
    throw new Error(`Unexpected chat header outside first line: ${filePath}:${lineNumber}`);
  }

  return {
    extra: parsed.extra,
    is_user: parsed.is_user === true,
    mes: getString(parsed.mes),
    send_date: getString(parsed.send_date),
  } satisfies StoredChatLine;
}

function getStoredAttachments(line: StoredChatLine): ChatMessageAttachmentRecord[] {
  const extra = line.extra;
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
    return [];
  }

  const stored = (extra as Record<string, unknown>).attachments;
  if (!Array.isArray(stored)) {
    return [];
  }

  return stored.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }

    const attachment = entry as StoredChatAttachment;
    const file = getNullableString(attachment.file);
    const mime = getNullableString(attachment.mime);

    if (!file || (mime !== 'image/png' && mime !== 'image/jpeg' && mime !== 'image/webp')) {
      return [];
    }

    return [{ id: file, mimeType: mime } satisfies ChatMessageAttachmentRecord];
  });
}

function getStoredReasoning(line: StoredChatLine): string | null {
  const extra = line.extra;

  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
    return null;
  }

  return getNullableString((extra as Record<string, unknown>).reasoning);
}

function getMessageRole(line: StoredChatLine): ChatMessageRoleRecord {
  if (line.extra && typeof line.extra === 'object' && !Array.isArray(line.extra)) {
    const extraSource = line.extra as Record<string, unknown>;
    if (extraSource.type === 'system') {
      return 'system';
    }
  }

  return line.is_user ? 'user' : 'assistant';
}

function createStoredChatLine(message: AppendChatMessageInput): StoredChatLine {
  const attachments = (message.attachments ?? []).map((attachment) => ({
    file: attachment.id,
    mime: attachment.mimeType,
  }));
  const reasoning = message.reasoning?.trim() ? message.reasoning : null;
  const extra = {
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(reasoning ? { reasoning } : {}),
  };

  if (message.role === 'system') {
    return {
      extra: {
        type: 'system',
      },
      is_user: false,
      mes: message.content,
      send_date: message.createdAt,
    };
  }

  return {
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
    is_user: message.role === 'user',
    mes: message.content,
    send_date: message.createdAt,
  };
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function updateHeaderRecord(
  existingHeader: Record<string, unknown> | null,
  session: ChatSessionRecord,
  updatedAt: string,
  generationSettings = session.generationSettings,
) {
  const header = existingHeader ?? {};
  const metadata = getRecord(header.chat_metadata);

  return {
    ...header,
    chat_metadata: {
      ...metadata,
      createdAt: getString(metadata.createdAt, session.chat.createdAt),
      title: getString(metadata.title, session.chat.title),
      updatedAt,
    },
    character_id: getString(header.character_id, session.characterId ?? ''),
    character_name: getString(header.character_name, session.characterName ?? ''),
    scenario_id: getString(header.scenario_id, session.scenarioId ?? ''),
    scenario_name: getString(header.scenario_name, session.scenarioName ?? ''),
    lorebook_ids: Array.isArray(header.lorebook_ids) ? header.lorebook_ids : (session.lorebookIds ?? []),
    generation_settings: serializeGenerationSettings(generationSettings),
    user_name: getString(header.user_name, session.userName ?? ''),
  } satisfies StoredChatHeader;
}

function getFallbackTitle(chatId: string, messages: ChatMessageRecord[]) {
  const firstMessage = messages.find((message) => message.content.trim().length > 0);

  if (firstMessage) {
    return firstMessage.content.slice(0, 80);
  }

  return `${DEFAULT_CHAT_TITLE_PREFIX} ${chatId.slice(0, 8)}`;
}

function getLatestIsoDate(...values: Array<string | null | undefined>) {
  const candidates = values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((left, right) => right.localeCompare(left))[0] ?? null;
}

export interface ParsedChatTranscriptHeader {
  characterName: string | null;
  createdAt: string | null;
  generationSettings: ChatGenerationSettingsRecord;
  lorebookIds: string[];
  scenarioName: string | null;
  title: string | null;
  userName: string | null;
}

export interface ParsedChatTranscript {
  header: ParsedChatTranscriptHeader | null;
  messages: AppendChatMessageInput[];
  skippedLines: number;
}

function trimmedOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Lenient variant of the transcript parsing used by readChatFile: built on the
 * same helpers (parseStoredHeader/parseStoredChatLine), but lines that would
 * make the strict reader throw are counted as skipped instead. Used for import.
 */
export function parseChatTranscriptLeniently(
  rawContent: string,
  source: string,
  fallbackCreatedAt: string,
): ParsedChatTranscript {
  const lines = rawContent
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let header: ParsedChatTranscriptHeader | null = null;
  let messageLines = lines;
  let skippedLines = 0;

  if (lines.length > 0) {
    try {
      const storedHeader = parseStoredHeader(lines[0] ?? '', source);
      if (storedHeader) {
        header = {
          characterName: trimmedOrNull(storedHeader.character_name ?? ''),
          createdAt: trimmedOrNull(storedHeader.chat_metadata?.createdAt ?? ''),
          generationSettings: parseStoredGenerationSettings(storedHeader.generation_settings, source),
          lorebookIds: [...(storedHeader.lorebook_ids ?? [])],
          scenarioName: trimmedOrNull(storedHeader.scenario_name ?? ''),
          title: trimmedOrNull(storedHeader.chat_metadata?.title ?? ''),
          userName: trimmedOrNull(storedHeader.user_name ?? ''),
        };
        messageLines = lines.slice(1);
      }
    } catch {
      // Malformed first line: not a header; the message loop will count it as skipped.
    }
  }

  const messages: AppendChatMessageInput[] = [];
  for (const [index, line] of messageLines.entries()) {
    let storedLine: StoredChatLine | null = null;
    try {
      storedLine = parseStoredChatLine(line, source, (header ? 2 : 1) + index);
    } catch {
      storedLine = null;
    }

    if (!storedLine) {
      skippedLines += 1;
      continue;
    }

    messages.push({
      content: storedLine.mes ?? '',
      createdAt: storedLine.send_date || fallbackCreatedAt,
      role: getMessageRole(storedLine),
    });
  }

  return { header, messages, skippedLines };
}

async function readChatFile(chatId: string): Promise<ChatSessionRecord | null> {
  const filePath = resolveChatFilePath(chatId);
  let rawContent: string;
  let stats: Awaited<ReturnType<typeof fs.stat>>;

  try {
    [rawContent, stats] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)]);
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === 'ENOENT') {
      return null;
    }

    throw error;
  }

  const lines = rawContent
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    throw new Error(`Empty chat file: ${filePath}`);
  }

  const header = parseStoredHeader(lines[0] ?? '', filePath);
  const messageLines = lines.slice(header ? 1 : 0);
  const fallbackCreatedAt = stats.birthtimeMs > 0 ? stats.birthtime.toISOString() : stats.mtime.toISOString();
  const messages = messageLines.flatMap((line, index) => {
    const storedLine = parseStoredChatLine(line, filePath, (header ? 2 : 1) + index);
    if (!storedLine) {
      return [];
    }

    return [
      {
        attachments: getStoredAttachments(storedLine),
        id: `${chatId}:${index + 1}`,
        reasoning: getStoredReasoning(storedLine),
        role: getMessageRole(storedLine),
        content: storedLine.mes ?? '',
        createdAt: storedLine.send_date || fallbackCreatedAt,
      } satisfies ChatMessageRecord,
    ];
  });
  const updatedAt =
    getLatestIsoDate(messages.at(-1)?.createdAt, header?.chat_metadata?.updatedAt) ?? stats.mtime.toISOString();
  const createdAt = getString(header?.chat_metadata?.createdAt).trim() || fallbackCreatedAt;
  const title = getString(header?.chat_metadata?.title).trim() || getFallbackTitle(chatId, messages);
  const lorebookIds = Array.isArray(header?.lorebook_ids) ? [...header.lorebook_ids] : [];
  const summary: ChatSummaryRecord = {
    id: chatId,
    title,
    createdAt,
    updatedAt,
    messageCount: messages.length,
    lastMessagePreview: deriveLastMessagePreview(messages.at(-1)?.content),
    characterId: getString(header?.character_id).trim() || null,
    characterName: getString(header?.character_name).trim() || null,
    scenarioId: getString(header?.scenario_id).trim() || null,
    scenarioName: getString(header?.scenario_name).trim() || null,
    lorebookIds,
  };

  return {
    chat: summary,
    userName: getString(header?.user_name) || null,
    characterId: summary.characterId,
    characterName: summary.characterName,
    scenarioId: summary.scenarioId,
    scenarioName: summary.scenarioName,
    lorebookIds,
    generationSettings: header?.generation_settings
      ? parseStoredGenerationSettings(header.generation_settings, filePath)
      : createDefaultChatGenerationSettings(),
    messages,
  };
}

export class FileChatRepository implements ChatRepository {
  async appendGenericChatMessages(
    chatId: string,
    messages: AppendChatMessageInput[],
    options?: { requireEmptyTranscript?: boolean },
  ) {
    return withChatWriteQueue(chatId, async () => {
      const currentSession = await readChatFile(chatId);

      if (!currentSession) {
        return null;
      }

      // Инвариант проверяется внутри очереди записи: проверка до вызова провайдера
      // не защищает от сообщений, добавленных за время генерации.
      if (options?.requireEmptyTranscript && currentSession.messages.length > 0) {
        throw new ChatTranscriptNotEmptyError(chatId);
      }

      if (messages.length === 0) {
        return currentSession;
      }

      const filePath = resolveChatFilePath(chatId);
      const rawContent = await fs.readFile(filePath, 'utf8');
      const lines = rawContent
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const existingHeader = lines[0] ? parseStoredHeaderRecord(lines[0], filePath) : null;
      const existingMessageLines = existingHeader ? lines.slice(1) : lines;
      const updatedAt = messages[messages.length - 1]!.createdAt;
      const nextLines = [
        JSON.stringify(updateHeaderRecord(existingHeader, currentSession, updatedAt)),
        ...existingMessageLines,
        ...messages.map((message) => JSON.stringify(createStoredChatLine(message))),
      ];

      await writeFileAtomically(filePath, `${nextLines.join('\n')}\n`);

      return readChatFile(chatId);
    });
  }

  async appendContinuationToLastAssistantMessage(chatId: string, input: AppendContinuationToLastAssistantMessageInput) {
    return withChatWriteQueue(chatId, async () => {
      const currentSession = await readChatFile(chatId);

      if (!currentSession) {
        return null;
      }

      // Инвариант проверяется внутри очереди записи: за время генерации транскрипт
      // мог измениться, и продолжение больше некуда безопасно дописывать.
      const lastMessage = currentSession.messages.at(-1);
      const lastMessageStillMatches =
        lastMessage !== undefined &&
        lastMessage.role === 'assistant' &&
        currentSession.messages.length === input.expectedMessageIndex &&
        lastMessage.content.startsWith(input.expectedContentPrefix);

      if (!lastMessageStillMatches) {
        throw new ChatLastMessageChangedError(chatId);
      }

      const filePath = resolveChatFilePath(chatId);
      const rawContent = await fs.readFile(filePath, 'utf8');
      const lines = rawContent
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const existingHeader = lines[0] ? parseStoredHeaderRecord(lines[0], filePath) : null;
      const existingMessageLines = existingHeader ? lines.slice(1) : lines;
      const targetIndex = input.expectedMessageIndex - 1;
      const targetLine = parseStoredChatLine(existingMessageLines[targetIndex] ?? '', filePath, targetIndex + 2);

      if (!targetLine) {
        throw new ChatLastMessageChangedError(chatId);
      }

      const updatedLine = {
        ...targetLine,
        mes: joinContinuationContent(lastMessage.content, input.continuation),
      };
      existingMessageLines[targetIndex] = JSON.stringify(updatedLine);
      const nextLines = [
        JSON.stringify(updateHeaderRecord(existingHeader, currentSession, input.updatedAt)),
        ...existingMessageLines,
      ];

      await writeFileAtomically(filePath, `${nextLines.join('\n')}\n`);

      return readChatFile(chatId);
    });
  }

  async forkGenericChat(input: ForkGenericChatInput): Promise<ChatSummaryRecord | null> {
    return withChatWriteQueue(input.sourceChatId, async () => {
      const sourceSession = await readChatFile(input.sourceChatId);
      if (!sourceSession) {
        return null;
      }
      if (input.throughIndex < 1 || input.throughIndex > sourceSession.messages.length) {
        return null;
      }

      const sourceFilePath = resolveChatFilePath(input.sourceChatId);
      const rawContent = await fs.readFile(sourceFilePath, 'utf8');
      const lines = rawContent
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const sourceHeader = lines[0] ? parseStoredHeaderRecord(lines[0], sourceFilePath) : null;
      const sourceMessageLines = sourceHeader ? lines.slice(1) : lines;
      const keptMessageLines = sourceMessageLines.slice(0, input.throughIndex);
      const newHeader: StoredChatHeader = {
        chat_metadata: {
          createdAt: input.createdAt,
          title: input.title,
          updatedAt: input.createdAt,
        },
        character_id: sourceSession.characterId ?? '',
        character_name: sourceSession.characterName ?? '',
        scenario_id: sourceSession.scenarioId ?? '',
        scenario_name: sourceSession.scenarioName ?? '',
        lorebook_ids: sourceSession.lorebookIds ?? [],
        generation_settings: serializeGenerationSettings(sourceSession.generationSettings),
        user_name: sourceSession.userName ?? '',
      };
      const nextLines = [JSON.stringify(newHeader), ...keptMessageLines];
      const newFilePath = resolveChatFilePath(input.newChatId);

      await fs.mkdir(resolveChatsDirectory(), { recursive: true });
      await writeFileAtomically(newFilePath, `${nextLines.join('\n')}\n`);

      const newSession = await readChatFile(input.newChatId);
      return newSession?.chat ?? null;
    });
  }

  async deleteGenericChat(chatId: string): Promise<boolean> {
    return withChatWriteQueue(chatId, async () => {
      const filePath = resolveChatFilePath(chatId);
      try {
        await fs.unlink(filePath);
        // Вложения принадлежат чату: без него они уже никому не нужны.
        await deleteChatAttachmentFiles(chatId);
        return true;
      } catch (error) {
        const candidate = error as NodeJS.ErrnoException;
        if (candidate.code === 'ENOENT') {
          return false;
        }
        throw error;
      }
    });
  }

  async createGenericChat(input: CreateGenericChatInput): Promise<ChatSummaryRecord> {
    const header: StoredChatHeader = {
      chat_metadata: {
        createdAt: input.createdAt,
        title: input.title,
        updatedAt: input.createdAt,
      },
      generation_settings: serializeGenerationSettings(
        input.generationSettings ?? createDefaultChatGenerationSettings(),
      ),
      user_name: input.userName,
      character_id: input.characterId ?? '',
      character_name: input.characterName ?? '',
      scenario_id: input.scenarioId ?? '',
      scenario_name: input.scenarioName ?? '',
      lorebook_ids: input.lorebookIds ?? [],
    };

    await fs.mkdir(resolveChatsDirectory(), { recursive: true });
    const seedMessages = input.seedMessages ?? [];
    const lines = [
      JSON.stringify(header),
      ...seedMessages.map((message) => JSON.stringify(createStoredChatLine(message))),
    ];
    await fs.writeFile(resolveChatFilePath(input.id), `${lines.join('\n')}\n`, 'utf8');

    const lastSeed = seedMessages.at(-1);

    return {
      id: input.id,
      title: input.title,
      createdAt: input.createdAt,
      updatedAt: lastSeed?.createdAt ?? input.createdAt,
      messageCount: seedMessages.length,
      lastMessagePreview: deriveLastMessagePreview(lastSeed?.content),
      characterId: input.characterId ?? null,
      characterName: input.characterName ?? null,
      scenarioId: input.scenarioId ?? null,
      scenarioName: input.scenarioName ?? null,
      lorebookIds: input.lorebookIds ?? [],
    };
  }

  async getGenericChatSession(chatId: string) {
    return readChatFile(chatId);
  }

  async listChatFileStats(): Promise<ChatFileStatRecord[]> {
    let entries: string[];

    try {
      entries = await fs.readdir(resolveChatsDirectory());
    } catch (error) {
      const candidate = error as NodeJS.ErrnoException;
      if (candidate.code === 'ENOENT') {
        return [];
      }

      throw error;
    }

    const stats = await Promise.all(
      entries
        .filter((entry) => entry.endsWith('.jsonl'))
        .map(async (entry) => {
          try {
            const fileStats = await fs.stat(path.join(resolveChatsDirectory(), entry));
            if (!fileStats.isFile()) {
              return null;
            }

            return {
              chatId: path.parse(entry).name,
              fileMtimeMs: fileStats.mtimeMs,
              fileSize: fileStats.size,
            } satisfies ChatFileStatRecord;
          } catch {
            // Файл исчез между readdir и stat — параллельное удаление, просто пропускаем.
            return null;
          }
        }),
    );

    return stats.filter((stat): stat is ChatFileStatRecord => stat !== null);
  }

  async readChatSummaryWithSearchText(chatId: string): Promise<ChatSummaryWithSearchText | null> {
    const session = await readChatFile(chatId);
    if (!session) {
      return null;
    }

    return {
      searchText: {
        characterNameLower: session.characterName?.toLowerCase() ?? null,
        messageTextsLower: session.messages.map((message) => message.content.toLowerCase()),
        titleLower: session.chat.title.toLowerCase(),
      },
      summary: session.chat,
    };
  }

  async listGenericChats(options: ListGenericChatsOptions = {}): Promise<ChatSummaryRecord[]> {
    let entries: string[];

    try {
      entries = await fs.readdir(resolveChatsDirectory());
    } catch (error) {
      const candidate = error as NodeJS.ErrnoException;
      if (candidate.code === 'ENOENT') {
        return [];
      }

      throw error;
    }

    const sessions = await Promise.all(
      entries.filter((entry) => entry.endsWith('.jsonl')).map(async (entry) => readChatFile(path.parse(entry).name)),
    );
    const needle = options.searchText?.trim().toLowerCase() ?? '';
    const matchesNeedle = (session: ChatSessionRecord): boolean => {
      if (!needle) return true;
      if (session.chat.title.toLowerCase().includes(needle)) return true;
      if (session.characterName?.toLowerCase().includes(needle)) return true;
      return session.messages.some((message) => message.content.toLowerCase().includes(needle));
    };

    return sessions
      .flatMap((session) => (session && matchesNeedle(session) ? [session.chat] : []))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async updateGenericChatGenerationSettings(chatId: string, settings: ChatGenerationSettingsRecord, updatedAt: string) {
    return withChatWriteQueue(chatId, async () => {
      const currentSession = await readChatFile(chatId);

      if (!currentSession) {
        return null;
      }

      const filePath = resolveChatFilePath(chatId);
      const rawContent = await fs.readFile(filePath, 'utf8');
      const lines = rawContent
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const existingHeader = lines[0] ? parseStoredHeaderRecord(lines[0], filePath) : null;
      const existingMessageLines = existingHeader ? lines.slice(1) : lines;
      const nextLines = [
        JSON.stringify(updateHeaderRecord(existingHeader, currentSession, updatedAt, settings)),
        ...existingMessageLines,
      ];

      await writeFileAtomically(filePath, `${nextLines.join('\n')}\n`);

      return readChatFile(chatId);
    });
  }

  async updateGenericChatLorebooks(chatId: string, lorebookIds: string[], updatedAt: string) {
    return withChatWriteQueue(chatId, async () => {
      const currentSession = await readChatFile(chatId);

      if (!currentSession) {
        return null;
      }

      const filePath = resolveChatFilePath(chatId);
      const rawContent = await fs.readFile(filePath, 'utf8');
      const lines = rawContent
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const existingHeader = lines[0] ? parseStoredHeaderRecord(lines[0], filePath) : null;
      const existingMessageLines = existingHeader ? lines.slice(1) : lines;
      const nextHeaderRecord = {
        ...(existingHeader ?? {}),
        lorebook_ids: [...lorebookIds],
      };
      const nextLines = [
        JSON.stringify(updateHeaderRecord(nextHeaderRecord, currentSession, updatedAt)),
        ...existingMessageLines,
      ];

      await writeFileAtomically(filePath, `${nextLines.join('\n')}\n`);

      return readChatFile(chatId);
    });
  }

  async updateGenericChatTitle(
    chatId: string,
    title: string,
    updatedAt: string,
    options?: { expectedCurrentTitle?: string },
  ) {
    return withChatWriteQueue(chatId, async () => {
      const currentSession = await readChatFile(chatId);

      if (!currentSession) {
        return null;
      }

      // Прекондиция против молчаливой перезаписи параллельного ручного переименования.
      if (options?.expectedCurrentTitle !== undefined && currentSession.chat.title !== options.expectedCurrentTitle) {
        throw new ChatTitleConflictError(chatId);
      }

      const filePath = resolveChatFilePath(chatId);
      const rawContent = await fs.readFile(filePath, 'utf8');
      const lines = rawContent
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const existingHeader = lines[0] ? parseStoredHeaderRecord(lines[0], filePath) : null;
      const existingMessageLines = existingHeader ? lines.slice(1) : lines;
      const existingMetadata = getRecord(existingHeader?.chat_metadata);
      const nextHeaderRecord = {
        ...(existingHeader ?? {}),
        chat_metadata: {
          ...existingMetadata,
          title,
        },
      };
      const nextLines = [
        JSON.stringify(updateHeaderRecord(nextHeaderRecord, currentSession, updatedAt)),
        ...existingMessageLines,
      ];

      await writeFileAtomically(filePath, `${nextLines.join('\n')}\n`);

      return readChatFile(chatId);
    });
  }

  async updateGenericChatBindings(
    chatId: string,
    bindings: {
      characterId?: string | null;
      characterName?: string | null;
      scenarioId?: string | null;
      scenarioName?: string | null;
    },
    updatedAt: string,
  ) {
    return withChatWriteQueue(chatId, async () => {
      const currentSession = await readChatFile(chatId);
      if (!currentSession) {
        return null;
      }

      const filePath = resolveChatFilePath(chatId);
      const rawContent = await fs.readFile(filePath, 'utf8');
      const lines = rawContent
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const existingHeader = lines[0] ? parseStoredHeaderRecord(lines[0], filePath) : null;
      const existingMessageLines = existingHeader ? lines.slice(1) : lines;

      const nextHeaderRecord = { ...(existingHeader ?? {}) };
      if (bindings.characterId !== undefined) {
        nextHeaderRecord.character_id = bindings.characterId ?? '';
      }
      if (bindings.characterName !== undefined) {
        nextHeaderRecord.character_name = bindings.characterName ?? '';
      }
      if (bindings.scenarioId !== undefined) {
        nextHeaderRecord.scenario_id = bindings.scenarioId ?? '';
      }
      if (bindings.scenarioName !== undefined) {
        nextHeaderRecord.scenario_name = bindings.scenarioName ?? '';
      }

      // Build a synthetic session record so updateHeaderRecord uses the new identifiers in its
      // getString(headerValue, sessionFallback) calls instead of resurrecting the old ones.
      const projectedCharacterId = getString(nextHeaderRecord.character_id).trim() || null;
      const projectedCharacterName = getString(nextHeaderRecord.character_name).trim() || null;
      const projectedScenarioId = getString(nextHeaderRecord.scenario_id).trim() || null;
      const projectedScenarioName = getString(nextHeaderRecord.scenario_name).trim() || null;
      const sessionWithNewBindings: ChatSessionRecord = {
        ...currentSession,
        characterId: projectedCharacterId,
        characterName: projectedCharacterName,
        scenarioId: projectedScenarioId,
        scenarioName: projectedScenarioName,
        chat: {
          ...currentSession.chat,
          characterId: projectedCharacterId,
          characterName: projectedCharacterName,
          scenarioId: projectedScenarioId,
          scenarioName: projectedScenarioName,
        },
      };

      const nextLines = [
        JSON.stringify(updateHeaderRecord(nextHeaderRecord, sessionWithNewBindings, updatedAt)),
        ...existingMessageLines,
      ];

      await writeFileAtomically(filePath, `${nextLines.join('\n')}\n`);

      return readChatFile(chatId);
    });
  }

  async updateGenericChatMessage(chatId: string, messageIndex: number, content: string, updatedAt: string) {
    return withChatWriteQueue(chatId, async () => {
      const currentSession = await readChatFile(chatId);

      if (!currentSession) {
        return null;
      }

      if (messageIndex < 1 || messageIndex > currentSession.messages.length) {
        return null;
      }

      const filePath = resolveChatFilePath(chatId);
      const rawContent = await fs.readFile(filePath, 'utf8');
      const lines = rawContent
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const existingHeader = lines[0] ? parseStoredHeaderRecord(lines[0], filePath) : null;
      const existingMessageLines = existingHeader ? lines.slice(1) : lines;
      const targetIndex = messageIndex - 1;

      if (!existingMessageLines[targetIndex]) {
        return null;
      }

      const targetLine = parseStoredChatLine(existingMessageLines[targetIndex] ?? '', filePath, targetIndex + 2);
      if (!targetLine) {
        return null;
      }

      const updatedLine = {
        ...targetLine,
        mes: content,
      };
      existingMessageLines[targetIndex] = JSON.stringify(updatedLine);
      const nextLines = [
        JSON.stringify(updateHeaderRecord(existingHeader, currentSession, updatedAt)),
        ...existingMessageLines,
      ];

      await writeFileAtomically(filePath, `${nextLines.join('\n')}\n`);

      return readChatFile(chatId);
    });
  }

  async deleteGenericChatMessage(chatId: string, messageIndex: number, updatedAt: string) {
    return withChatWriteQueue(chatId, async () => {
      const currentSession = await readChatFile(chatId);

      if (!currentSession) {
        return null;
      }

      if (messageIndex < 1 || messageIndex > currentSession.messages.length) {
        return null;
      }

      const filePath = resolveChatFilePath(chatId);
      const rawContent = await fs.readFile(filePath, 'utf8');
      const lines = rawContent
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const existingHeader = lines[0] ? parseStoredHeaderRecord(lines[0], filePath) : null;
      const existingMessageLines = existingHeader ? lines.slice(1) : lines;
      const keptMessageLines = [
        ...existingMessageLines.slice(0, messageIndex - 1),
        ...existingMessageLines.slice(messageIndex),
      ];
      const nextLines = [
        JSON.stringify(updateHeaderRecord(existingHeader, currentSession, updatedAt)),
        ...keptMessageLines,
      ];

      await writeFileAtomically(filePath, `${nextLines.join('\n')}\n`);

      return readChatFile(chatId);
    });
  }

  async truncateGenericChatMessagesFromIndex(chatId: string, fromIndex: number, updatedAt: string) {
    return withChatWriteQueue(chatId, async () => {
      const currentSession = await readChatFile(chatId);

      if (!currentSession) {
        return null;
      }

      if (fromIndex < 1 || fromIndex > currentSession.messages.length) {
        return null;
      }

      const filePath = resolveChatFilePath(chatId);
      const rawContent = await fs.readFile(filePath, 'utf8');
      const lines = rawContent
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const existingHeader = lines[0] ? parseStoredHeaderRecord(lines[0], filePath) : null;
      const existingMessageLines = existingHeader ? lines.slice(1) : lines;
      const keptMessageLines = existingMessageLines.slice(0, fromIndex - 1);
      const nextLines = [
        JSON.stringify(updateHeaderRecord(existingHeader, currentSession, updatedAt)),
        ...keptMessageLines,
      ];

      await writeFileAtomically(filePath, `${nextLines.join('\n')}\n`);

      return readChatFile(chatId);
    });
  }
}
