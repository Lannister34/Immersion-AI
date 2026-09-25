import {
  GenerateScenarioDraftCommandSchema,
  type GenerateScenarioDraftResponse,
  GenerateScenarioDraftResponseSchema,
} from '@immersion/contracts/generation';

import { createChatCompletionClient } from '../infrastructure/chat-completion-client-factory.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import {
  buildGenderHint,
  buildPlayerContextBlock,
  type DraftGenerationContext,
  normalizeDraftTags,
  normalizeDraftText,
  replaceNamesWithPlaceholders,
  resolveDraftGenerationContext,
} from './draft-generation-support.js';
import { ProviderGenerationError } from './generation-errors.js';
import { asJsonRecord, extractJsonFromModelOutput } from './model-json-output.js';

export interface GenerateScenarioDraftDependencies {
  chatCompletionClient?: ChatCompletionClient;
  signal?: AbortSignal;
}

const SCENARIO_DRAFT_MAX_TOKENS = 2048;

// Легаси /scenario делал двухшаговую генерацию (buildSummaryPrompt поверх карточки
// персонажа и лорбука). Драфт-команда принимает только концепцию, поэтому
// суммаризация неприменима и остаётся один шаг генерации.
const SCENARIO_DRAFT_SYSTEM_INSTRUCTION = {
  en: `You are a creative writing assistant specializing in roleplay scenarios.
MANDATORY: In ALL output text, use the literal placeholders {{user}} and {{char}} to refer to the player and the character respectively. NEVER substitute real names — write exactly {{user}} and {{char}} as template variables.
IMPORTANT: The scenario describes a SITUATION, not the characters. Do NOT repeat character descriptions, traits, appearance, or backstory — that information is already in the character card. Focus on: where the scene takes place, what is happening, what circumstances brought {{user}} and {{char}} together, and what tension or hook drives the interaction.
Return ONLY valid JSON, no other text.`,
  ru: `Ты — помощник для создания ролевых сценариев.
ОБЯЗАТЕЛЬНО: Во ВСЁМ тексте используй буквальные плейсхолдеры {{user}} и {{char}} для обозначения игрока и персонажа. НИКОГДА не подставляй настоящие имена — пиши именно {{user}} и {{char}} как шаблонные переменные.
ВАЖНО: Сценарий описывает СИТУАЦИЮ, а не персонажей. НЕ повторяй описания персонажей, черты, внешность или предысторию — эта информация уже есть в карточке персонажа. Сосредоточься на: месте действия, что происходит, какие обстоятельства свели {{user}} и {{char}}, какой конфликт или зацепка движет взаимодействием.
Возвращай ТОЛЬКО валидный JSON, без другого текста.`,
} as const;

function buildPresetNameLine(name: string | undefined, context: DraftGenerationContext): string {
  if (!name) {
    return '';
  }

  return context.language === 'ru'
    ? `\nНазвание сценария уже задано: "${name}". Верни его в поле "name" без изменений.`
    : `\nThe scenario title is already set: "${name}". Return it in the "name" field unchanged.`;
}

function buildScenarioDraftPrompt(concept: string, name: string | undefined, context: DraftGenerationContext): string {
  const genderHint = buildGenderHint(context);
  const playerContextBlock = buildPlayerContextBlock(context);
  const nameLine = buildPresetNameLine(name, context);

  if (context.language === 'ru') {
    return `Создай детальный ролевой сценарий на основе концепции: ${concept}${playerContextBlock}${nameLine}

Верни JSON-объект с такими полями:
{
  "name": "Короткое, ёмкое название сценария",
  "content": "Подробный текст сценария, описывающий СИТУАЦИЮ (3-5 абзацев): место действия, обстоятельства, что происходит, почему {{user}} и {{char}} здесь, какой конфликт или напряжение существует. НЕ описывай кто такой {{char}} — только что {{char}} ДЕЛАЕТ в сцене. Пример записи плейсхолдеров (иллюстрирует ТОЛЬКО формат {{user}}/{{char}}, а НЕ распределение ролей — роли всегда бери из концепции): '{{user}} заходит в старую таверну на окраине города. За стойкой {{char}} протирает бокалы, бросая настороженные взгляды на дверь...' — используй {{user}} и {{char}} буквально.",
  "firstMessage": "Вступительное сообщение сцены от лица {{char}}: действия в *звёздочках*, при желании речь. Задай сцену и пригласи {{user}} к взаимодействию. Используй {{user}} и {{char}} как буквальные плейсхолдеры.",
  "tags": ["тег1", "тег2", "тег3"]
}

ПРАВИЛА:
1. Пиши {{user}} и {{char}} как буквальные шаблонные плейсхолдеры — они будут заменены при выполнении
2. КРИТИЧНО: если в концепции роли {{user}} и {{char}} уже распределены — сохрани их в точности. НЕ меняй местами, кто из них приходит/посетитель/подчинённый, а кто принимает/хозяин/старший. Если по концепции приходит {{char}}, а принимает {{user}} — так и пиши, даже если привычнее было бы наоборот
3. НИКОГДА не заменяй {{user}} или {{char}} настоящими именами, местоимениями вроде "вы/ты" или словами "пользователь/персонаж"
4. НЕ описывай, кто такой {{char}} — внешность, характер, предысторию (это уже есть в карточке персонажа). Описывай только что {{char}} ДЕЛАЕТ в сцене
5. ${genderHint}Используй соответствующие русские грамматические окончания для {{user}} (например: "{{user}} подошёл" для мужского, "{{user}} подошла" для женского)
6. ${context.languageSentence} Будь креативен и конкретен.`;
  }

  return `Create a detailed roleplay scenario based on this concept: ${concept}${playerContextBlock}${nameLine}

Return a JSON object with these fields:
{
  "name": "Short, evocative scenario title",
  "content": "Detailed scenario text describing the SITUATION (3-5 paragraphs): location, circumstances, what is happening, why {{user}} and {{char}} are here, what tension or conflict exists. Do NOT describe who {{char}} is — only what {{char}} is doing. Use {{user}} and {{char}} literally.",
  "firstMessage": "Opening message for this scene from {{char}}'s perspective: actions in *asterisks*, optionally speech. Set the scene and invite interaction. Use {{user}} and {{char}} as literal placeholders.",
  "tags": ["tag1", "tag2", "tag3"]
}

RULES:
1. Write {{user}} and {{char}} as literal template placeholders — they will be substituted at runtime
2. CRITICAL: if the concept already assigns roles to {{user}} and {{char}}, preserve them exactly. Do NOT swap who arrives/visits/defers and who receives/hosts/is in charge. If the concept has {{char}} arriving and {{user}} receiving, write it that way even if the reverse feels more conventional
3. NEVER replace {{user}} or {{char}} with actual names, pronouns, or "user/character"
4. Do NOT describe who {{char}} is — appearance, personality, backstory (that is already in the character card). Only describe what {{char}} is DOING in the scene
5. ${genderHint}Use appropriate grammatical endings for {{user}}
6. ${context.languageSentence} Be creative and specific.`;
}

export async function generateScenarioDraft(
  input: unknown,
  dependencies: GenerateScenarioDraftDependencies = {},
): Promise<GenerateScenarioDraftResponse> {
  const command = GenerateScenarioDraftCommandSchema.parse(input);
  const chatCompletionClient = dependencies.chatCompletionClient ?? createChatCompletionClient();
  const context = await resolveDraftGenerationContext();
  const completion = await chatCompletionClient.completeChat({
    endpoint: context.endpoint,
    maxTokens: SCENARIO_DRAFT_MAX_TOKENS,
    messages: [
      {
        role: 'system',
        content: SCENARIO_DRAFT_SYSTEM_INSTRUCTION[context.language],
      },
      {
        role: 'user',
        content: buildScenarioDraftPrompt(command.concept, command.name, context),
      },
    ],
    sampling: context.sampling,
    signal: dependencies.signal,
  });
  const record = asJsonRecord(extractJsonFromModelOutput(completion.content), 'a scenario draft');
  // Пост-обработка как в легаси: возвращаем просочившееся имя игрока обратно в {{user}}.
  const content = replaceNamesWithPlaceholders(normalizeDraftText(record.content, 20_000), null, context.userName);
  const firstMessage = replaceNamesWithPlaceholders(
    normalizeDraftText(record.firstMessage ?? record.first_mes, 20_000),
    null,
    context.userName,
  );
  const name = command.name ?? normalizeDraftText(record.name, 200);

  if (name.length === 0) {
    throw new ProviderGenerationError('Provider returned a scenario draft without a name. Try again.');
  }

  if (content.length === 0) {
    throw new ProviderGenerationError('Provider returned a scenario draft without content. Try again.');
  }

  return GenerateScenarioDraftResponseSchema.parse({
    content,
    firstMessage,
    name,
    tags: normalizeDraftTags(record.tags),
  });
}
