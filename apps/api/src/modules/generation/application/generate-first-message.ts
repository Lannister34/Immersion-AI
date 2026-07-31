import type { ChatSessionDto } from '@immersion/contracts/chats';
import {
  GenerateFirstMessageCommandSchema,
  type GenerateFirstMessageResponse,
  GenerateFirstMessageResponseSchema,
} from '@immersion/contracts/generation';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';

import { appendChatMessages, ChatNotFoundError } from '../../chats/application/append-chat-messages.js';
import { ChatTranscriptNotEmptyError } from '../../chats/application/chat-conflicts.js';
import { getChatSession } from '../../chats/application/get-chat-session.js';
import { loadChatPromptContext } from '../../prompting/application/load-chat-prompt-context.js';
import { resolveChatReplyGenerationPlan } from '../../prompting/application/resolve-chat-reply-generation-plan.js';
import { resolveGenerationProviderEndpoint } from '../../providers/application/generation-provider.js';
import { getSettingsOverview } from '../../settings/application/get-settings-overview.js';
import { OpenAiCompatibleChatCompletionsClient } from '../infrastructure/openai-compatible-chat-completions-client.js';
import { getProviderTokenCounter } from '../infrastructure/provider-token-counter.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import { ChatNotEmptyError } from './generation-errors.js';

export interface GenerateFirstMessageDependencies {
  chatCompletionClient?: ChatCompletionClient;
  now?: () => Date;
  signal?: AbortSignal;
}

function buildLanguageSentence(
  responseLanguage: SettingsOverviewResponse['profile']['responseLanguage'],
  hasCharacterContext: boolean,
): string | null {
  if (responseLanguage === 'ru') {
    return 'Write it in Russian.';
  }

  if (responseLanguage === 'en') {
    return 'Write it in English.';
  }

  if (hasCharacterContext) {
    return 'Write it in the same language as the character and scenario description.';
  }

  return null;
}

function buildOpeningInstruction(
  session: ChatSessionDto,
  characterName: string | null,
  responseLanguage: SettingsOverviewResponse['profile']['responseLanguage'],
): string {
  const sentences =
    characterName !== null
      ? [
          `Begin the role-play now. Write ${characterName}'s opening message to ${session.userName}: set the scene in character and invite a response.`,
          'Write only the message itself, with no preamble or commentary.',
        ]
      : [
          'Start the conversation: write a short, friendly opening message that invites the user to talk.',
          'Write only the message itself, with no preamble or commentary.',
        ];
  const languageSentence = buildLanguageSentence(responseLanguage, characterName !== null);

  if (languageSentence) {
    sentences.push(languageSentence);
  }

  return sentences.join(' ');
}

export async function generateFirstMessage(
  input: unknown,
  dependencies: GenerateFirstMessageDependencies = {},
): Promise<GenerateFirstMessageResponse> {
  const command = GenerateFirstMessageCommandSchema.parse(input);
  const now = dependencies.now ?? (() => new Date());
  const chatCompletionClient = dependencies.chatCompletionClient ?? new OpenAiCompatibleChatCompletionsClient();
  const session = await getChatSession(command.chatId);

  if (!session) {
    throw new ChatNotFoundError(command.chatId);
  }

  if (session.messages.length > 0) {
    throw new ChatNotEmptyError(command.chatId);
  }

  const endpoint = await resolveGenerationProviderEndpoint();
  const settings = getSettingsOverview();
  const characterContext = await loadChatPromptContext(session);
  const generationPlan = await resolveChatReplyGenerationPlan({
    character: characterContext.character,
    characterScenarioContent: characterContext.characterScenarioContent,
    lorebookSections: characterContext.lorebookSections,
    providerModelName: endpoint.model,
    session,
    settings,
    tokenCounter: getProviderTokenCounter(),
    trailingUserInstruction: buildOpeningInstruction(
      session,
      characterContext.character?.name ?? null,
      settings.profile.responseLanguage,
    ),
  });
  const completion = await chatCompletionClient.completeChat({
    endpoint,
    maxTokens: generationPlan.providerRequest.maxTokens,
    messages: generationPlan.providerRequest.messages,
    sampling: generationPlan.providerRequest.sampling,
    signal: dependencies.signal,
  });
  let sessionAfterFirstMessage: ChatSessionDto;
  try {
    sessionAfterFirstMessage = await appendChatMessages(
      command.chatId,
      [
        {
          role: 'assistant',
          content: completion.content,
          createdAt: now().toISOString(),
        },
      ],
      { requireEmptyTranscript: true },
    );
  } catch (error) {
    if (error instanceof ChatTranscriptNotEmptyError) {
      throw new ChatNotEmptyError(command.chatId);
    }
    throw error;
  }

  return GenerateFirstMessageResponseSchema.parse({
    session: sessionAfterFirstMessage,
  });
}
