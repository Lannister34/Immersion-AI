import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { ChatReplyGenerationResponse, StartChatReplyGenerationCommand } from '@immersion/contracts/generation';
import { appendChatMessages } from '../../chats/application/append-chat-messages.js';
import { loadCharacterContextForSession } from '../../chats/application/load-character-context.js';
import { InvalidChatGenerationSettingsResolutionError } from '../../prompting/application/resolve-chat-generation-settings.js';
import { resolveChatReplyGenerationPlan } from '../../prompting/application/resolve-chat-reply-generation-plan.js';
import {
  GenerationProviderUnavailableError,
  resolveGenerationProviderEndpoint,
} from '../../providers/application/generation-provider.js';
import { OpenAiCompatibleChatCompletionsClient } from '../infrastructure/openai-compatible-chat-completions-client.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import { ChatReplyGenerationFailedError, ProviderGenerationError } from './generation-errors.js';

export interface ChatReplyGenerationDependencies {
  chatCompletionClient?: ChatCompletionClient;
  now?: () => Date;
  signal?: AbortSignal;
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new DOMException('Generation was canceled.', 'AbortError');
  }
}

export async function appendUserMessageForChatReply(
  command: StartChatReplyGenerationCommand,
  now: () => Date,
): Promise<ChatSessionDto> {
  return appendChatMessages(command.chatId, [
    {
      role: 'user',
      content: command.message,
      createdAt: now().toISOString(),
    },
  ]);
}

export async function completeChatReplyForSession(
  command: StartChatReplyGenerationCommand,
  sessionAfterUserMessage: ChatSessionDto,
  dependencies: ChatReplyGenerationDependencies = {},
): Promise<ChatReplyGenerationResponse> {
  const now = dependencies.now ?? (() => new Date());
  const chatCompletionClient = dependencies.chatCompletionClient ?? new OpenAiCompatibleChatCompletionsClient();
  let completion: Awaited<ReturnType<ChatCompletionClient['completeChat']>>;

  try {
    throwIfAborted(dependencies.signal);

    const endpoint = await resolveGenerationProviderEndpoint();
    const characterContext = await loadCharacterContextForSession(sessionAfterUserMessage);
    const generationPlan = resolveChatReplyGenerationPlan({
      character: characterContext.character,
      characterScenarioContent: characterContext.characterScenarioContent,
      providerModelName: endpoint.model,
      session: sessionAfterUserMessage,
    });

    completion = await chatCompletionClient.completeChat({
      endpoint,
      maxTokens: generationPlan.providerRequest.maxTokens,
      messages: generationPlan.providerRequest.messages,
      sampling: generationPlan.providerRequest.sampling,
      signal: dependencies.signal,
    });

    throwIfAborted(dependencies.signal);
  } catch (error) {
    if (error instanceof GenerationProviderUnavailableError) {
      throw new ChatReplyGenerationFailedError(
        409,
        'generation_provider_unavailable',
        error.message,
        sessionAfterUserMessage,
      );
    }

    if (error instanceof InvalidChatGenerationSettingsResolutionError) {
      throw new ChatReplyGenerationFailedError(
        409,
        'invalid_chat_generation_settings',
        error.message,
        sessionAfterUserMessage,
      );
    }

    if (error instanceof ProviderGenerationError) {
      throw new ChatReplyGenerationFailedError(
        502,
        'provider_generation_failed',
        error.message,
        sessionAfterUserMessage,
      );
    }

    throw error;
  }

  const sessionAfterGeneratedExchange = await appendChatMessages(command.chatId, [
    {
      role: 'assistant',
      content: completion.content,
      createdAt: now().toISOString(),
    },
  ]);

  return {
    session: sessionAfterGeneratedExchange,
  };
}
