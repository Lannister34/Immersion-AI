import type { ChatSessionDto } from '@immersion/contracts/chats';
import {
  type GenerateFirstMessageCommand,
  type GenerateFirstMessageResponse,
  GenerateFirstMessageResponseSchema,
} from '@immersion/contracts/generation';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';

import type { Clock } from '../../../platform/clock/clock.js';
import { ChatNotFoundError, ChatTranscriptNotEmptyError } from '../../chats/index.js';
import type { TokenCounter } from '../../prompting/index.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import { ChatNotEmptyError } from './generation-errors.js';
import type {
  ChatSessionPort,
  GenerationOptions,
  GenerationSettingsSource,
  PromptPlanPort,
  ProviderEndpointResolver,
} from './generation-ports.js';

export interface GenerateFirstMessageDependencies {
  readonly chatCompletionClient: ChatCompletionClient;
  readonly chats: Pick<ChatSessionPort, 'appendChatMessages' | 'getChatSession'>;
  readonly clock: Clock;
  readonly prompting: Pick<PromptPlanPort, 'loadChatPromptContext' | 'resolveChatReplyGenerationPlan'>;
  readonly providers: ProviderEndpointResolver;
  readonly settings: GenerationSettingsSource;
  readonly tokenCounter: TokenCounter;
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
  command: GenerateFirstMessageCommand,
  dependencies: GenerateFirstMessageDependencies,
  options: GenerationOptions = {},
): Promise<GenerateFirstMessageResponse> {
  const session = await dependencies.chats.getChatSession(command.chatId);

  if (!session) {
    throw new ChatNotFoundError(command.chatId);
  }

  if (session.messages.length > 0) {
    throw new ChatNotEmptyError(command.chatId);
  }

  const endpoint = await dependencies.providers.resolveGenerationProviderEndpoint();
  const settings = dependencies.settings.getSettingsOverview();
  const characterContext = await dependencies.prompting.loadChatPromptContext(session);
  const generationPlan = await dependencies.prompting.resolveChatReplyGenerationPlan({
    character: characterContext.character,
    characterScenarioContent: characterContext.characterScenarioContent,
    lorebookSections: characterContext.lorebookSections,
    providerContextSize: endpoint.contextSize,
    providerModelName: endpoint.model,
    session,
    settings,
    tokenCounter: dependencies.tokenCounter,
    trailingUserInstruction: buildOpeningInstruction(
      session,
      characterContext.character?.name ?? null,
      settings.profile.responseLanguage,
    ),
  });
  const completion = await dependencies.chatCompletionClient.completeChat({
    endpoint,
    maxTokens: generationPlan.providerRequest.maxTokens,
    messages: generationPlan.providerRequest.messages,
    sampling: generationPlan.providerRequest.sampling,
    signal: options.signal,
  });
  let sessionAfterFirstMessage: ChatSessionDto;
  try {
    sessionAfterFirstMessage = await dependencies.chats.appendChatMessages(
      command.chatId,
      [
        {
          role: 'assistant',
          content: completion.content,
          createdAt: dependencies.clock.now().toISOString(),
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
