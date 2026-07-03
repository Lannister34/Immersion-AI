import {
  type CharacterDraftFields,
  GenerateCharacterAvatarPromptCommandSchema,
  type GenerateCharacterAvatarPromptResponse,
  GenerateCharacterAvatarPromptResponseSchema,
} from '@immersion/contracts/generation';

import { OpenAiCompatibleChatCompletionsClient } from '../infrastructure/openai-compatible-chat-completions-client.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import { normalizeDraftText, resolveDraftGenerationContext } from './draft-generation-support.js';
import { ProviderGenerationError } from './generation-errors.js';
import { asJsonRecord, extractJsonFromModelOutput } from './model-json-output.js';

export interface GenerateCharacterAvatarPromptDependencies {
  chatCompletionClient?: ChatCompletionClient;
  signal?: AbortSignal;
}

const AVATAR_PROMPT_MAX_TOKENS = 512;
const AVATAR_PROMPT_MAX_LENGTH = 2_000;

// Stable Diffusion промпты всегда на английском — языковой профиль здесь не применяется.
const AVATAR_PROMPT_SYSTEM_INSTRUCTION =
  'You are an expert at writing Stable Diffusion image generation prompts. Return ONLY valid JSON.';

function buildAvatarPromptUserMessage(card: CharacterDraftFields): string {
  return `Generate a Stable Diffusion portrait prompt for this character:
Name: ${card.name ?? ''}
Description: ${card.description ?? ''}
Personality: ${card.personality ?? ''}

Return JSON:
{
  "prompt": "comma-separated SD tags: subject description, art style (anime/realistic), quality tags like (masterpiece, best quality, detailed), lighting, colors"
}`;
}

export async function generateCharacterAvatarPrompt(
  input: unknown,
  dependencies: GenerateCharacterAvatarPromptDependencies = {},
): Promise<GenerateCharacterAvatarPromptResponse> {
  const command = GenerateCharacterAvatarPromptCommandSchema.parse(input);
  const chatCompletionClient = dependencies.chatCompletionClient ?? new OpenAiCompatibleChatCompletionsClient();
  const context = await resolveDraftGenerationContext();
  const completion = await chatCompletionClient.completeChat({
    endpoint: context.endpoint,
    maxTokens: AVATAR_PROMPT_MAX_TOKENS,
    messages: [
      {
        role: 'system',
        content: AVATAR_PROMPT_SYSTEM_INSTRUCTION,
      },
      {
        role: 'user',
        content: buildAvatarPromptUserMessage(command.card),
      },
    ],
    sampling: context.sampling,
    signal: dependencies.signal,
  });
  const record = asJsonRecord(extractJsonFromModelOutput(completion.content), 'an avatar prompt');
  // Легаси-модели могут вернуть поле "positive" вместо "prompt".
  const prompt = normalizeDraftText(record.prompt ?? record.positive, AVATAR_PROMPT_MAX_LENGTH);

  if (prompt.length === 0) {
    throw new ProviderGenerationError('Provider returned an empty avatar prompt. Try again.');
  }

  return GenerateCharacterAvatarPromptResponseSchema.parse({ prompt });
}
