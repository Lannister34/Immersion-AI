import {
  type CharacterDraftFields,
  GenerateCharacterDraftCommandSchema,
  type GenerateCharacterDraftResponse,
  GenerateCharacterDraftResponseSchema,
} from '@immersion/contracts/generation';

import { OpenAiCompatibleChatCompletionsClient } from '../infrastructure/openai-compatible-chat-completions-client.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import {
  type DraftGenerationContext,
  normalizeDraftTags,
  normalizeDraftText,
  resolveDraftGenerationContext,
} from './draft-generation-support.js';
import { ProviderGenerationError } from './generation-errors.js';
import { asJsonRecord, extractJsonFromModelOutput } from './model-json-output.js';

export interface GenerateCharacterDraftDependencies {
  chatCompletionClient?: ChatCompletionClient;
  signal?: AbortSignal;
}

const CHARACTER_DRAFT_MAX_TOKENS = 2048;

const CHARACTER_DRAFT_SYSTEM_INSTRUCTION = {
  en: 'You are a character card writer for a roleplay chat app. Return ONLY valid JSON, no other text.',
  ru: 'Ты составляешь карточки персонажей для ролевого чат-приложения. Возвращай ТОЛЬКО валидный JSON, без другого текста.',
} as const;

const CHARACTER_DRAFT_FIELD_LABELS: Record<keyof CharacterDraftFields, { en: string; ru: string }> = {
  description: { en: 'Description', ru: 'Описание' },
  exampleDialogue: { en: 'Example dialogue', ru: 'Пример диалога' },
  firstMessage: { en: 'First message', ru: 'Первое сообщение' },
  name: { en: 'Name', ru: 'Имя' },
  personality: { en: 'Personality', ru: 'Характер' },
  scenario: { en: 'Scenario', ru: 'Сценарий' },
};

function buildProvidedFieldsBlock(fields: CharacterDraftFields | undefined, language: 'en' | 'ru'): string {
  const providedEntries = Object.entries(fields ?? {}).filter(
    (entry): entry is [keyof CharacterDraftFields, string] =>
      typeof entry[1] === 'string' && entry[1].trim().length > 0,
  );

  if (providedEntries.length === 0) {
    return '';
  }

  const lines = providedEntries
    .map(([field, value]) => `- ${CHARACTER_DRAFT_FIELD_LABELS[field][language]}: ${value.trim()}`)
    .join('\n');

  return language === 'ru'
    ? `\n\nУже заполненные поля (сохрани их смысл и согласованность, не противоречь им):\n${lines}\n`
    : `\n\nAlready filled fields (keep the draft consistent with them, do not contradict them):\n${lines}\n`;
}

function buildCharacterDraftPrompt(
  concept: string,
  fields: CharacterDraftFields | undefined,
  languageSentence: string,
  language: 'en' | 'ru',
): string {
  if (language === 'ru') {
    return `Концепция персонажа: ${concept}${buildProvidedFieldsBlock(fields, language)}

Верни JSON-объект с такими полями:
{
  "name": "Полное имя персонажа",
  "description": "Внешность + статус/роль. Кратко и по существу, как справочная карточка — НЕ литературный текст. Укажи: волосы, глаза, рост, телосложение, заметные физические особенности, типичная одежда/стиль, социальная роль или занятие (например: школьница, официантка, детектив). Максимум 1-2 коротких абзаца.",
  "personality": "Ключевые черты характера, манера речи, привычки, особенности. Компактный список или 1-2 коротких абзаца.",
  "scenario": "Ситуация по умолчанию для ролевой сцены: где происходит действие и что свело {{user}} и {{char}}. 1-2 коротких абзаца, используй буквальные плейсхолдеры {{user}} и {{char}}.",
  "firstMessage": "Вступительное сообщение от лица персонажа: действия в *звёздочках*, при желании речь. Задай сцену и пригласи к взаимодействию. Используй {{user}} и {{char}} как буквальные плейсхолдеры.",
  "exampleDialogue": "<START>\\n{{user}}: пример сообщения\\n{{char}}: пример ответа\\n<START>\\n{{user}}: ещё пример\\n{{char}}: ещё ответ",
  "tags": ["тег1", "тег2", "тег3"]
}

ВАЖНО: "description" — это НЕ биография и НЕ предыстория. Это визуальная справочная карточка. НЕ включай историю, мотивации или художественную прозу.
${languageSentence} Конкретно и кратко.`;
  }

  return `Character concept: ${concept}${buildProvidedFieldsBlock(fields, language)}

Return a JSON object with these exact fields:
{
  "name": "Character's full name",
  "description": "Physical appearance + role/status. Keep it concise and factual, like a reference card — NOT a literary text. Include: hair, eyes, height, build, notable physical features, typical clothing/style, social role or occupation (e.g. schoolgirl, waitress, detective). 1-2 short paragraphs max.",
  "personality": "Key personality traits, speech patterns, quirks, habits. Write as a compact list or 1-2 short paragraphs.",
  "scenario": "Default roleplay situation: where the scene takes place and what brought {{user}} and {{char}} together. 1-2 short paragraphs, use the literal placeholders {{user}} and {{char}}.",
  "firstMessage": "Opening message from the character's perspective: actions in *asterisks*, optionally speech. Set the scene and invite interaction. Use {{user}} and {{char}} as literal placeholders.",
  "exampleDialogue": "<START>\\n{{user}}: example message\\n{{char}}: example response\\n<START>\\n{{user}}: another example\\n{{char}}: another response",
  "tags": ["tag1", "tag2", "tag3"]
}

IMPORTANT: "description" is NOT a backstory or biography. It is a physical/visual reference card. Do NOT include history, motivations, or narrative prose.
${languageSentence} Be specific but brief.`;
}

function normalizeCharacterDraft(
  parsed: unknown,
  fields: CharacterDraftFields | undefined,
): GenerateCharacterDraftResponse {
  const record = asJsonRecord(parsed, 'a character draft');
  const draft = {
    description: normalizeDraftText(record.description, 20_000),
    exampleDialogue: normalizeDraftText(record.exampleDialogue ?? record.mes_example, 20_000),
    firstMessage: normalizeDraftText(record.firstMessage ?? record.first_mes, 20_000),
    name: normalizeDraftText(record.name, 200),
    personality: normalizeDraftText(record.personality, 5_000),
    scenario: normalizeDraftText(record.scenario, 5_000),
    tags: normalizeDraftTags(record.tags),
  };

  // Явно переданные значения формы выигрывают у сгенерированных.
  for (const [field, value] of Object.entries(fields ?? {})) {
    if (typeof value === 'string' && value.trim().length > 0) {
      draft[field as keyof CharacterDraftFields] = value;
    }
  }

  if (draft.name.trim().length === 0) {
    throw new ProviderGenerationError('Provider returned a character draft without a name. Try again.');
  }

  return GenerateCharacterDraftResponseSchema.parse(draft);
}

export async function generateCharacterDraft(
  input: unknown,
  dependencies: GenerateCharacterDraftDependencies = {},
): Promise<GenerateCharacterDraftResponse> {
  const command = GenerateCharacterDraftCommandSchema.parse(input);
  const chatCompletionClient = dependencies.chatCompletionClient ?? new OpenAiCompatibleChatCompletionsClient();
  const context: DraftGenerationContext = await resolveDraftGenerationContext();
  const completion = await chatCompletionClient.completeChat({
    endpoint: context.endpoint,
    maxTokens: CHARACTER_DRAFT_MAX_TOKENS,
    messages: [
      {
        role: 'system',
        content: CHARACTER_DRAFT_SYSTEM_INSTRUCTION[context.language],
      },
      {
        role: 'user',
        content: buildCharacterDraftPrompt(command.concept, command.fields, context.languageSentence, context.language),
      },
    ],
    sampling: context.sampling,
    signal: dependencies.signal,
  });

  return normalizeCharacterDraft(extractJsonFromModelOutput(completion.content), command.fields);
}
