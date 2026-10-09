import type { ChatMessageDto } from '@immersion/contracts/chats';
import {
  GenerateChatTitleCommandSchema,
  type GenerateChatTitleResponse,
  GenerateChatTitleResponseSchema,
} from '@immersion/contracts/generation';

import { ChatNotFoundError } from '../../chats/application/append-chat-messages.js';
import { getChatSession } from '../../chats/application/get-chat-session.js';
import { updateChatTitle } from '../../chats/application/update-chat-title.js';
import { resolveChatGenerationSettings } from '../../prompting/application/resolve-chat-generation-settings.js';
import { resolveGenerationProviderEndpoint } from '../../providers/application/generation-provider.js';
import { getSettingsOverview } from '../../settings/application/get-settings-overview.js';
import { createChatCompletionClient } from '../infrastructure/chat-completion-client-factory.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import { ChatTranscriptEmptyError, ProviderGenerationError } from './generation-errors.js';

export interface GenerateChatTitleDependencies {
  chatCompletionClient?: ChatCompletionClient;
  signal?: AbortSignal;
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
  input: unknown,
  dependencies: GenerateChatTitleDependencies = {},
): Promise<GenerateChatTitleResponse> {
  const command = GenerateChatTitleCommandSchema.parse(input);
  const chatCompletionClient = dependencies.chatCompletionClient ?? createChatCompletionClient();
  const session = await getChatSession(command.chatId);

  if (!session) {
    throw new ChatNotFoundError(command.chatId);
  }

  if (session.messages.length === 0) {
    throw new ChatTranscriptEmptyError(command.chatId);
  }

  const endpoint = await resolveGenerationProviderEndpoint();
  const effectiveSettings = resolveChatGenerationSettings(
    getSettingsOverview(),
    endpoint.model,
    session.generationSettings,
  );
  const completion = await chatCompletionClient.completeChat({
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
    signal: dependencies.signal,
  });
  const title = sanitizeGeneratedChatTitle(completion.content);

  if (title.length === 0) {
    throw new ProviderGenerationError('Provider returned an unusable chat title.');
  }

  const chat = await updateChatTitle({
    chatId: command.chatId,
    title,
    expectedCurrentTitle: session.chat.title,
  });

  return GenerateChatTitleResponseSchema.parse({
    chat,
    title,
  });
}
