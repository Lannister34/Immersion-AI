import type { ChatMessageDto, ChatSessionDto } from '@immersion/contracts/chats';
import type {
  ChatReplyGenerationResponse,
  ContinueChatReplyCommand,
  StartChatReplyCommand,
} from '@immersion/contracts/generation';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { appendChatMessages } from '../../chats/application/append-chat-messages.js';
import { readChatAttachmentDataUrl, resolveChatAttachments } from '../../chats/application/chat-attachments.js';
import { ChatLastMessageChangedError } from '../../chats/application/chat-conflicts.js';
import { appendAssistantMessageContinuation } from '../../chats/application/continue-last-assistant-message.js';
import { loadChatPromptContext } from '../../prompting/application/load-chat-prompt-context.js';
import { InvalidChatGenerationSettingsResolutionError } from '../../prompting/application/resolve-chat-generation-settings.js';
import { resolveChatReplyGenerationPlan } from '../../prompting/application/resolve-chat-reply-generation-plan.js';
import {
  GenerationProviderUnavailableError,
  resolveGenerationProviderEndpoint,
} from '../../providers/application/generation-provider.js';
import { getSettingsOverview } from '../../settings/application/get-settings-overview.js';
import { OpenAiCompatibleChatCompletionsClient } from '../infrastructure/openai-compatible-chat-completions-client.js';
import { getProviderTokenCounter } from '../infrastructure/provider-token-counter.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import {
  ChatReplyGenerationFailedError,
  NothingToAnswerError,
  NothingToContinueError,
  ProviderGenerationError,
} from './generation-errors.js';

export interface ChatReplyGenerationDependencies {
  /** Куски ответа по мере генерации; без него запрос идёт без стриминга. */
  onDelta?: ((delta: string) => void) | undefined;
  chatCompletionClient?: ChatCompletionClient;
  now?: () => Date;
  signal?: AbortSignal;
}

const CONTINUE_REPLY_INSTRUCTION = [
  'Continue your previous reply exactly from the point where it stops.',
  'Do not repeat or rephrase anything you already wrote, and do not add any preamble or commentary:',
  'output only the continuation text.',
].join(' ');

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new DOMException('Generation was canceled.', 'AbortError');
  }
}

function buildContinuationLanguageSentence(
  responseLanguage: SettingsOverviewResponse['profile']['responseLanguage'],
): string {
  if (responseLanguage === 'ru') {
    return 'Write the continuation in Russian.';
  }

  if (responseLanguage === 'en') {
    return 'Write the continuation in English.';
  }

  return 'Write the continuation in the same language as your previous reply.';
}

function mapChatReplyGenerationError(error: unknown, session: ChatSessionDto): unknown {
  if (error instanceof GenerationProviderUnavailableError) {
    return new ChatReplyGenerationFailedError(409, 'generation_provider_unavailable', error.message, session);
  }

  if (error instanceof InvalidChatGenerationSettingsResolutionError) {
    return new ChatReplyGenerationFailedError(409, 'invalid_chat_generation_settings', error.message, session);
  }

  if (error instanceof ProviderGenerationError) {
    return new ChatReplyGenerationFailedError(502, 'provider_generation_failed', error.message, session);
  }

  return error;
}

async function runChatCompletionForSession(
  session: ChatSessionDto,
  dependencies: ChatReplyGenerationDependencies,
  buildTrailingInstruction?: (settings: SettingsOverviewResponse) => string,
): Promise<string> {
  const chatCompletionClient = dependencies.chatCompletionClient ?? new OpenAiCompatibleChatCompletionsClient();

  try {
    throwIfAborted(dependencies.signal);

    const endpoint = await resolveGenerationProviderEndpoint();
    const settings = getSettingsOverview();
    const characterContext = await loadChatPromptContext(session);
    const messageImages = await loadMessageImages(session);
    // The trailing instruction goes through the plan so it is counted inside
    // the context budget instead of overflowing an already-full prompt.
    const generationPlan = await resolveChatReplyGenerationPlan({
      character: characterContext.character,
      characterScenarioContent: characterContext.characterScenarioContent,
      lorebookSections: characterContext.lorebookSections,
      messageImages,
      providerModelName: endpoint.model,
      session,
      settings,
      tokenCounter: getProviderTokenCounter(),
      trailingUserInstruction: buildTrailingInstruction ? buildTrailingInstruction(settings) : null,
    });
    // Стриминг включается настройкой профиля: без неё ответ приходит целиком,
    // как раньше, и провайдеру уходит stream: false.
    const streamingDelta = settings.profile.streamingEnabled ? dependencies.onDelta : undefined;
    const completion = await chatCompletionClient.completeChat({
      endpoint,
      maxTokens: generationPlan.providerRequest.maxTokens,
      messages: generationPlan.providerRequest.messages,
      ...(streamingDelta ? { onDelta: streamingDelta } : {}),
      sampling: generationPlan.providerRequest.sampling,
      signal: dependencies.signal,
    });

    throwIfAborted(dependencies.signal);

    return completion.content;
  } catch (error) {
    throw mapChatReplyGenerationError(error, session);
  }
}

/**
 * Картинки сообщений читаем один раз на генерацию: провайдер принимает их
 * как data-URL, а держать base64 в транскрипте незачем.
 */
async function loadMessageImages(session: ChatSessionDto): Promise<ReadonlyMap<string, string[]>> {
  const images = new Map<string, string[]>();

  for (const message of session.messages) {
    if (message.attachments.length === 0) {
      continue;
    }

    const dataUrls: string[] = [];

    for (const attachment of message.attachments) {
      const dataUrl = await readChatAttachmentDataUrl(session.chat.id, attachment.id);

      if (dataUrl) {
        dataUrls.push(dataUrl);
      }
    }

    if (dataUrls.length > 0) {
      images.set(message.id, dataUrls);
    }
  }

  return images;
}

export async function appendUserMessageForChatReply(
  command: StartChatReplyCommand,
  now: () => Date,
): Promise<ChatSessionDto> {
  // Вложения проверяем до записи: id приходит от клиента и мог указывать
  // на файл, которого в этом чате нет.
  const attachments = await resolveChatAttachments(command.chatId, command.attachmentIds ?? []);

  return appendChatMessages(command.chatId, [
    {
      attachments,
      role: 'user',
      content: command.message,
      createdAt: now().toISOString(),
    },
  ]);
}

export async function completeChatReplyForSession(
  command: Pick<StartChatReplyCommand, 'chatId'>,
  sessionAfterUserMessage: ChatSessionDto,
  dependencies: ChatReplyGenerationDependencies = {},
): Promise<ChatReplyGenerationResponse> {
  const now = dependencies.now ?? (() => new Date());
  const content = await runChatCompletionForSession(sessionAfterUserMessage, dependencies);
  const sessionAfterGeneratedExchange = await appendChatMessages(command.chatId, [
    {
      role: 'assistant',
      content,
      createdAt: now().toISOString(),
    },
  ]);

  return {
    session: sessionAfterGeneratedExchange,
  };
}

/** Отвечать можно, только когда транскрипт заканчивается непустой репликой пользователя. */
export function getAnswerableUserMessage(chatId: string, session: ChatSessionDto): ChatMessageDto {
  const lastMessage = session.messages.at(-1);

  if (!lastMessage || lastMessage.role !== 'user' || lastMessage.content.trim().length === 0) {
    throw new NothingToAnswerError(chatId);
  }

  return lastMessage;
}

export function getContinuableAssistantMessage(chatId: string, session: ChatSessionDto): ChatMessageDto {
  const lastMessage = session.messages.at(-1);

  if (!lastMessage || lastMessage.role !== 'assistant' || lastMessage.content.trim().length === 0) {
    throw new NothingToContinueError(chatId);
  }

  return lastMessage;
}

export async function completeChatReplyContinuationForSession(
  command: ContinueChatReplyCommand,
  session: ChatSessionDto,
  dependencies: ChatReplyGenerationDependencies = {},
): Promise<ChatReplyGenerationResponse> {
  const now = dependencies.now ?? (() => new Date());
  const lastMessage = getContinuableAssistantMessage(command.chatId, session);
  const continuation = await runChatCompletionForSession(
    session,
    dependencies,
    (settings) =>
      `${CONTINUE_REPLY_INSTRUCTION} ${buildContinuationLanguageSentence(settings.profile.responseLanguage)}`,
  );

  try {
    const sessionAfterContinuation = await appendAssistantMessageContinuation(command.chatId, {
      continuation,
      expectedContentPrefix: lastMessage.content,
      expectedMessageIndex: session.messages.length,
      updatedAt: now().toISOString(),
    });

    return {
      session: sessionAfterContinuation,
    };
  } catch (error) {
    if (error instanceof ChatLastMessageChangedError) {
      throw new ChatReplyGenerationFailedError(
        409,
        'chat_changed_during_generation',
        'Чат изменился во время генерации — продолжение не было сохранено.',
        session,
      );
    }

    throw error;
  }
}
