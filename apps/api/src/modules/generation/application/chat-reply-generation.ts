import type { ChatMessageDto, ChatSessionDto } from '@immersion/contracts/chats';
import type {
  ChatReplyGenerationResponse,
  ContinueChatReplyCommand,
  StartChatReplyCommand,
} from '@immersion/contracts/generation';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import type { ReplyChannel } from '@immersion/domain/generation';

import type { Clock } from '../../../platform/clock/clock.js';
import { ChatLastMessageChangedError } from '../../chats/index.js';
import { InvalidChatGenerationSettingsResolutionError, type TokenCounter } from '../../prompting/index.js';
import { GenerationProviderUnavailableError } from '../../providers/index.js';
import type { ChatCompletionClient, ChatCompletionResponse } from './chat-completion-client.js';
import {
  ChatReplyGenerationFailedError,
  NothingToAnswerError,
  NothingToContinueError,
  ProviderGenerationError,
} from './generation-errors.js';
import type {
  ChatSessionPort,
  GenerationOptions,
  GenerationSettingsSource,
  PromptPlanPort,
  ProviderEndpointResolver,
} from './generation-ports.js';

export interface ChatReplyGenerationDependencies {
  readonly chatCompletionClient: ChatCompletionClient;
  readonly chats: Pick<
    ChatSessionPort,
    | 'appendAssistantMessageContinuation'
    | 'appendChatMessages'
    | 'getChatSession'
    | 'readChatAttachmentDataUrl'
    | 'resolveChatAttachments'
  >;
  readonly clock: Clock;
  readonly prompting: Pick<PromptPlanPort, 'loadChatPromptContext' | 'resolveChatReplyGenerationPlan'>;
  readonly providers: ProviderEndpointResolver;
  readonly settings: GenerationSettingsSource;
  readonly tokenCounter: TokenCounter;
}

export interface ChatReplyGenerationOptions extends GenerationOptions {
  readonly onDelta?: ((delta: string, channel: ReplyChannel) => void) | undefined;
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
  options: ChatReplyGenerationOptions,
  buildTrailingInstruction?: (settings: SettingsOverviewResponse) => string,
): Promise<ChatCompletionResponse> {
  try {
    throwIfAborted(options.signal);

    const endpoint = await dependencies.providers.resolveGenerationProviderEndpoint();
    const settings = dependencies.settings.getSettingsOverview();
    const characterContext = await dependencies.prompting.loadChatPromptContext(session);
    const messageImages = await loadMessageImages(session, dependencies.chats);
    const generationPlan = await dependencies.prompting.resolveChatReplyGenerationPlan({
      character: characterContext.character,
      characterScenarioContent: characterContext.characterScenarioContent,
      lorebookSections: characterContext.lorebookSections,
      messageImages,
      providerModelName: endpoint.model,
      session,
      settings,
      tokenCounter: dependencies.tokenCounter,
      trailingUserInstruction: buildTrailingInstruction ? buildTrailingInstruction(settings) : null,
    });
    const streamingDelta = settings.profile.streamingEnabled ? options.onDelta : undefined;
    const completion = await dependencies.chatCompletionClient.completeChat({
      endpoint,
      maxTokens: generationPlan.providerRequest.maxTokens,
      messages: generationPlan.providerRequest.messages,
      ...(streamingDelta ? { onDelta: streamingDelta } : {}),
      sampling: generationPlan.providerRequest.sampling,
      signal: options.signal,
    });

    throwIfAborted(options.signal);

    return completion;
  } catch (error) {
    throw mapChatReplyGenerationError(error, session);
  }
}

async function loadMessageImages(
  session: ChatSessionDto,
  chats: Pick<ChatSessionPort, 'readChatAttachmentDataUrl'>,
): Promise<ReadonlyMap<string, string[]>> {
  const images = new Map<string, string[]>();

  for (const message of session.messages) {
    if (message.attachments.length === 0) {
      continue;
    }

    const dataUrls: string[] = [];

    for (const attachment of message.attachments) {
      const dataUrl = await chats.readChatAttachmentDataUrl(session.chat.id, attachment.id);

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
  dependencies: Pick<ChatReplyGenerationDependencies, 'chats' | 'clock'>,
): Promise<ChatSessionDto> {
  const attachments = await dependencies.chats.resolveChatAttachments(command.chatId, command.attachmentIds ?? []);

  return dependencies.chats.appendChatMessages(command.chatId, [
    {
      attachments,
      role: 'user',
      content: command.message,
      createdAt: dependencies.clock.now().toISOString(),
    },
  ]);
}

export async function completeChatReplyForSession(
  command: Pick<StartChatReplyCommand, 'chatId'>,
  sessionAfterUserMessage: ChatSessionDto,
  dependencies: ChatReplyGenerationDependencies,
  options: ChatReplyGenerationOptions = {},
): Promise<ChatReplyGenerationResponse> {
  const content = await runChatCompletionForSession(sessionAfterUserMessage, dependencies, options);
  const sessionAfterGeneratedExchange = await dependencies.chats.appendChatMessages(command.chatId, [
    {
      role: 'assistant',
      content: content.content,
      createdAt: dependencies.clock.now().toISOString(),
      reasoning: content.reasoning,
    },
  ]);

  return {
    session: sessionAfterGeneratedExchange,
  };
}

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
  dependencies: ChatReplyGenerationDependencies,
  options: ChatReplyGenerationOptions = {},
): Promise<ChatReplyGenerationResponse> {
  const lastMessage = getContinuableAssistantMessage(command.chatId, session);
  const continuationResponse = await runChatCompletionForSession(
    session,
    dependencies,
    options,
    (settings) =>
      `${CONTINUE_REPLY_INSTRUCTION} ${buildContinuationLanguageSentence(settings.profile.responseLanguage)}`,
  );

  try {
    const sessionAfterContinuation = await dependencies.chats.appendAssistantMessageContinuation(command.chatId, {
      continuation: continuationResponse.content,
      expectedContentPrefix: lastMessage.content,
      expectedMessageIndex: session.messages.length,
      updatedAt: dependencies.clock.now().toISOString(),
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
