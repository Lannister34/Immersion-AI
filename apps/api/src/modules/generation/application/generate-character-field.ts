import {
  type CharacterDraftFieldName,
  type CharacterDraftFields,
  GenerateCharacterFieldCommandSchema,
  type GenerateCharacterFieldResponse,
  GenerateCharacterFieldResponseSchema,
} from '@immersion/contracts/generation';

import { OpenAiCompatibleChatCompletionsClient } from '../infrastructure/openai-compatible-chat-completions-client.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import {
  type DraftGenerationContext,
  normalizeDraftText,
  resolveDraftGenerationContext,
} from './draft-generation-support.js';
import { ProviderGenerationError } from './generation-errors.js';

export interface GenerateCharacterFieldDependencies {
  chatCompletionClient?: ChatCompletionClient;
  signal?: AbortSignal;
}

const CHARACTER_FIELD_MAX_TOKENS = 1024;
// Лимиты повторяют SaveCharacterCommandSchema: черновик поля обязан проходить сохранение карточки.
const FIELD_MAX_LENGTHS: Record<CharacterDraftFieldName, number> = {
  description: 20_000,
  exampleDialogue: 20_000,
  firstMessage: 20_000,
  name: 200,
  personality: 5_000,
  scenario: 5_000,
};
// При перегенерации поля поднимаем температуру, чтобы получить заметно другой вариант.
const REGENERATION_MIN_TEMPERATURE = 1.1;
const PREVIOUS_VALUE_EXCERPT_LENGTH = 2_000;

const CHARACTER_FIELD_SYSTEM_INSTRUCTION = {
  en: 'You are a character card writer for a roleplay chat app. Write concise, factual content — avoid literary prose or elaborate descriptions. Return ONLY the requested content as plain text, no JSON, no field names, no extra formatting.',
  ru: 'Ты составляешь карточки персонажей для ролевого чат-приложения. Пиши кратко и по существу — без литературной прозы и пышных описаний. Возвращай ТОЛЬКО запрошенный контент простым текстом, без JSON, без названий полей, без лишнего форматирования.',
} as const;

const FIELD_INSTRUCTIONS: Record<CharacterDraftFieldName, { en: string; ru: string }> = {
  description: {
    en: 'Write a concise physical/visual reference: hair, eyes, height, build, notable features, typical clothing, social role/occupation. 1-2 short paragraphs. Do NOT include backstory, history, or narrative prose.',
    ru: 'Напиши краткую визуальную справку: волосы, глаза, рост, телосложение, заметные особенности, типичная одежда, социальная роль/занятие. 1-2 коротких абзаца. НЕ включай предысторию или художественную прозу.',
  },
  exampleDialogue: {
    en: 'Write 2 example dialogue exchanges in this format:\n<START>\\n{{user}}: example message\\n{{char}}: example response\\n<START>\\n{{user}}: another example\\n{{char}}: another response',
    ru: 'Напиши 2 примера диалогов в таком формате:\n<START>\\n{{user}}: пример сообщения\\n{{char}}: пример ответа\\n<START>\\n{{user}}: ещё пример\\n{{char}}: ещё ответ',
  },
  firstMessage: {
    en: "Write the character's opening roleplay message: actions in *asterisks*, optionally speech. Set the scene and invite interaction. Use {{user}} and {{char}} as literal placeholders.",
    ru: 'Напиши вступительное ролевое сообщение от лица персонажа: действия в *звёздочках*, при желании речь. Задай сцену и пригласи к взаимодействию. Используй {{user}} и {{char}} как буквальные плейсхолдеры.',
  },
  name: {
    en: 'Generate a fitting full name for this character.',
    ru: 'Придумай подходящее полное имя для этого персонажа.',
  },
  personality: {
    en: 'Describe key personality traits, speech style, quirks, and habits.',
    ru: 'Опиши ключевые черты характера, манеру речи, привычки и особенности.',
  },
  scenario: {
    en: 'Describe the default roleplay situation: where the scene takes place and what brought {{user}} and {{char}} together. 1-2 short paragraphs, use the literal placeholders {{user}} and {{char}}.',
    ru: 'Опиши ситуацию по умолчанию для ролевой сцены: где происходит действие и что свело {{user}} и {{char}}. 1-2 коротких абзаца, используй буквальные плейсхолдеры {{user}} и {{char}}.',
  },
};

interface CharacterFieldPromptInput {
  concept: string | undefined;
  context: DraftGenerationContext;
  current: CharacterDraftFields;
  field: CharacterDraftFieldName;
  isRegeneration: boolean;
}

function buildCharacterFieldPrompt(input: CharacterFieldPromptInput): string {
  const instruction = FIELD_INSTRUCTIONS[input.field][input.context.language];
  // «Не повторяй предыдущий вариант» работает только если модель этот вариант видит.
  const previousValue = (input.current[input.field] ?? '').trim().slice(0, PREVIOUS_VALUE_EXCERPT_LENGTH);

  if (input.context.language === 'ru') {
    const task = input.isRegeneration
      ? `Напиши НОВЫЙ, ДРУГОЙ вариант поля "${input.field}". Не повторяй предыдущий вариант, придумай свежий взгляд на персонажа.`
      : `Сгенерируй поле "${input.field}".`;
    const previousBlock =
      input.isRegeneration && previousValue.length > 0
        ? `\n\nПредыдущий вариант поля "${input.field}" (не повторяй его):\n${previousValue}`
        : '';

    return `Исходная концепция: ${input.concept || 'не указана'}

Текущая карточка персонажа:
- Имя: ${input.current.name ?? ''}
- Описание: ${input.current.description ?? ''}
- Характер: ${input.current.personality ?? ''}${previousBlock}

Задача: ${task} ${instruction}

${input.context.languageSentence} Сохраняй согласованность с остальной карточкой. Верни ТОЛЬКО новое значение поля "${input.field}", ничего больше.`;
  }

  const task = input.isRegeneration
    ? `Write a NEW, DIFFERENT version of the "${input.field}" field. Do not repeat the previous version, come up with a fresh take.`
    : `Generate the "${input.field}" field.`;
  const previousBlock =
    input.isRegeneration && previousValue.length > 0
      ? `\n\nPrevious version of "${input.field}" (do not repeat it):\n${previousValue}`
      : '';

  return `Original concept: ${input.concept || 'not provided'}

Current character card:
- Name: ${input.current.name ?? ''}
- Description: ${input.current.description ?? ''}
- Personality: ${input.current.personality ?? ''}${previousBlock}

Task: ${task} ${instruction}

${input.context.languageSentence} Keep it consistent with the rest of the character card. Return ONLY the new value for "${input.field}", nothing else.`;
}

export async function generateCharacterField(
  input: unknown,
  dependencies: GenerateCharacterFieldDependencies = {},
): Promise<GenerateCharacterFieldResponse> {
  const command = GenerateCharacterFieldCommandSchema.parse(input);
  const chatCompletionClient = dependencies.chatCompletionClient ?? new OpenAiCompatibleChatCompletionsClient();
  const context = await resolveDraftGenerationContext();
  const isRegeneration = (command.current[command.field] ?? '').trim().length > 0;
  const completion = await chatCompletionClient.completeChat({
    endpoint: context.endpoint,
    maxTokens: CHARACTER_FIELD_MAX_TOKENS,
    messages: [
      {
        role: 'system',
        content: CHARACTER_FIELD_SYSTEM_INSTRUCTION[context.language],
      },
      {
        role: 'user',
        content: buildCharacterFieldPrompt({
          concept: command.concept,
          context,
          current: command.current,
          field: command.field,
          isRegeneration,
        }),
      },
    ],
    sampling: {
      ...context.sampling,
      temperature: isRegeneration
        ? Math.max(context.sampling.temperature, REGENERATION_MIN_TEMPERATURE)
        : context.sampling.temperature,
    },
    signal: dependencies.signal,
  });
  const value = normalizeDraftText(completion.content, FIELD_MAX_LENGTHS[command.field]);

  if (value.length === 0) {
    throw new ProviderGenerationError('Provider returned an empty character field value. Try again.');
  }

  return GenerateCharacterFieldResponseSchema.parse({ value });
}
