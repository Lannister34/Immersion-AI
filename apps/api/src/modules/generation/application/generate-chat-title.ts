import type { ChatMessageDto } from '@immersion/contracts/chats';
import {
  type GenerateChatTitleCommand,
  type GenerateChatTitleResponse,
  GenerateChatTitleResponseSchema,
} from '@immersion/contracts/generation';

import type { Clock } from '../../../platform/clock/clock.js';
import { ChatNotFoundError } from '../../chats/index.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import { ChatTranscriptEmptyError, ProviderGenerationError } from './generation-errors.js';
import type {
  ChatSessionPort,
  GenerationOptions,
  GenerationSettingsSource,
  PromptPlanPort,
  ProviderEndpointResolver,
} from './generation-ports.js';
import { SKIP_THINKING_SERVER_EXTENSIONS } from './skip-thinking-server-extensions.js';

export interface GenerateChatTitleDependencies {
  readonly chatCompletionClient: ChatCompletionClient;
  readonly chats: Pick<ChatSessionPort, 'getChatSession' | 'updateChatTitle'>;
  readonly clock: Clock;
  readonly prompting: Pick<PromptPlanPort, 'resolveChatGenerationSettings'>;
  readonly providers: ProviderEndpointResolver;
  readonly settings: GenerationSettingsSource;
}

const TITLE_TRANSCRIPT_MESSAGE_LIMIT = 10;
const TITLE_MESSAGE_EXCERPT_LENGTH = 400;
const TITLE_MAX_TOKENS = 48;
const TITLE_MAX_TEMPERATURE = 0.3;
const TITLE_MAX_LENGTH = 80;

const TITLE_SYSTEM_INSTRUCTION = [
  'You produce short titles for chat conversations.',
  'Reply with the title only: 3-6 words, in the same language as the conversation.',
  'No quotes, no emoji, no trailing punctuation, no explanations.',
].join(' ');

function buildTranscriptExcerpt(messages: ChatMessageDto[]): string {
  return messages
    .slice(-TITLE_TRANSCRIPT_MESSAGE_LIMIT)
    .filter((message) => message.content.trim().length > 0)
    .map((message) => {
      const content = message.content.trim();
      const truncated =
        content.length > TITLE_MESSAGE_EXCERPT_LENGTH ? `${content.slice(0, TITLE_MESSAGE_EXCERPT_LENGTH)}…` : content;

      return `${message.role}: ${truncated}`;
    })
    .join('\n');
}

export function sanitizeGeneratedChatTitle(raw: string): string {
  const collapsed = raw.replace(/\s+/gu, ' ').trim();
  const unquoted = collapsed.replace(/^["'`«»„“”‹›\s]+/u, '');
  const withoutTrailingPunctuation = unquoted.replace(/["'`«»„“”‹›.!?…:;,\s]+$/u, '');

  if (withoutTrailingPunctuation.length <= TITLE_MAX_LENGTH) {
    return withoutTrailingPunctuation;
  }

  const hardCapped = withoutTrailingPunctuation.slice(0, TITLE_MAX_LENGTH);
  const wordCapped = hardCapped.replace(/\s+\S*$/u, '').trim();

  return wordCapped.length > 0 ? wordCapped : hardCapped.trim();
}

export async function generateChatTitle(
  command: GenerateChatTitleCommand,
  dependencies: GenerateChatTitleDependencies,
  options: GenerationOptions = {},
): Promise<GenerateChatTitleResponse> {
  const session = await dependencies.chats.getChatSession(command.chatId);

  if (!session) {
    throw new ChatNotFoundError(command.chatId);
  }

  if (session.messages.length === 0) {
    throw new ChatTranscriptEmptyError(command.chatId);
  }

  const endpoint = await dependencies.providers.resolveGenerationProviderEndpoint();
  const effectiveSettings = dependencies.prompting.resolveChatGenerationSettings(
    dependencies.settings.getSettingsOverview(),
    endpoint.model,
    session.generationSettings,
  );
  const completion = await dependencies.chatCompletionClient.completeChat({
    endpoint,
    maxTokens: TITLE_MAX_TOKENS,
    messages: [
      {
        role: 'system',
        content: TITLE_SYSTEM_INSTRUCTION,
      },
      {
        role: 'user',
        content: `Conversation transcript:\n\n${buildTranscriptExcerpt(session.messages)}\n\nWrite the title for this conversation.`,
      },
    ],
    sampling: {
      minP: effectiveSettings.sampling.minP,
      presencePenalty: effectiveSettings.sampling.presencePenalty,
      repeatPenalty: effectiveSettings.sampling.repeatPenalty,
      repeatPenaltyRange: effectiveSettings.sampling.repeatPenaltyRange,
      temperature: Math.min(effectiveSettings.sampling.temperature, TITLE_MAX_TEMPERATURE),
      topK: effectiveSettings.sampling.topK,
      topP: effectiveSettings.sampling.topP,
    },
    serverExtensions: SKIP_THINKING_SERVER_EXTENSIONS,
    signal: options.signal,
  });
  const title = sanitizeGeneratedChatTitle(completion.content);

  if (title.length === 0) {
    throw new ProviderGenerationError('Provider returned an unusable chat title.');
  }

  const chat = await dependencies.chats.updateChatTitle({
    chatId: command.chatId,
    expectedCurrentTitle: session.chat.title,
    now: () => dependencies.clock.now(),
    title,
  });

  return GenerateChatTitleResponseSchema.parse({
    chat,
    title,
  });
}
