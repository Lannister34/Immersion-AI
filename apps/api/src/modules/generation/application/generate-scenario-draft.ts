import {
  GenerateScenarioDraftCommandSchema,
  type GenerateScenarioDraftResponse,
  GenerateScenarioDraftResponseSchema,
} from '@immersion/contracts/generation';

import { OpenAiCompatibleChatCompletionsClient } from '../infrastructure/openai-compatible-chat-completions-client.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import {
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

function buildGenderHint(context: DraftGenerationContext): string {
  if (context.language === 'ru') {
    return context.userName.trim()
      ? `Определи грамматический род {{user}} по имени игрока "${context.userName.trim()}". `
      : 'По умолчанию используй мужской грамматический род для {{user}}. ';
  }

  return context.userName.trim()
    ? `Determine {{user}}'s grammatical gender from the player name "${context.userName.trim()}". `
    : 'Default to masculine grammatical gender for {{user}}. ';
}

function buildPlayerContextBlock(context: DraftGenerationContext): string {
  if (!context.userName.trim() && !context.userPersona.trim()) {
    return '';
  }

  const personaLine = context.userPersona.trim()
    ? `\n- ${context.language === 'ru' ? 'Персона' : 'Persona'}: ${context.userPersona.trim()}`
    : '';

  return context.language === 'ru'
    ? `\n\nИнформация об игроке (для определения грамматического рода {{user}} — но пиши {{user}} в тексте, не имя):
- Имя: ${context.userName.trim() || 'Н/Д'}${personaLine}`
    : `\n\nPlayer info (for determining {{user}}'s grammatical gender — but still write {{user}} in output, not the name):
- Name: ${context.userName.trim() || 'N/A'}${personaLine}`;
}

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
  "content": "Подробный текст сценария, описывающий СИТУАЦИЮ (3-5 абзацев): место действия, обстоятельства, что происходит, почему {{user}} и {{char}} здесь, какой конфликт или напряжение существует. НЕ описывай кто такой {{char}} — только что {{char}} ДЕЛАЕТ в сцене. Пример: '{{user}} заходит в старую таверну на окраине города. За стойкой {{char}} протирает бокалы, бросая настороженные взгляды на дверь...' — используй {{user}} и {{char}} буквально.",
  "tags": ["тег1", "тег2", "тег3"]
}

ПРАВИЛА:
1. Пиши {{user}} и {{char}} как буквальные шаблонные плейсхолдеры — они будут заменены при выполнении
2. НИКОГДА не заменяй {{user}} или {{char}} настоящими именами, местоимениями вроде "вы/ты" или словами "пользователь/персонаж"
3. НЕ описывай внешность, характер, предысторию или роль {{char}} — это уже есть в карточке персонажа. Описывай только что {{char}} ДЕЛАЕТ в сцене
4. ${genderHint}Используй соответствующие русские грамматические окончания для {{user}} (например: "{{user}} подошёл" для мужского, "{{user}} подошла" для женского)
5. ${context.languageSentence} Будь креативен и конкретен.`;
  }

  return `Create a detailed roleplay scenario based on this concept: ${concept}${playerContextBlock}${nameLine}

Return a JSON object with these fields:
{
  "name": "Short, evocative scenario title",
  "content": "Detailed scenario text describing the SITUATION (3-5 paragraphs): location, circumstances, what is happening, why {{user}} and {{char}} are here, what tension or conflict exists. Do NOT describe who {{char}} is — only what {{char}} is doing. Use {{user}} and {{char}} literally.",
  "tags": ["tag1", "tag2", "tag3"]
}

RULES:
1. Write {{user}} and {{char}} as literal template placeholders — they will be substituted at runtime
2. NEVER replace {{user}} or {{char}} with actual names, pronouns, or "user/character"
3. Do NOT describe {{char}}'s appearance, personality, backstory, or role — that is already in the character card. Only describe what {{char}} is DOING in the scene
4. ${genderHint}Use appropriate grammatical endings for {{user}}
5. ${context.languageSentence} Be creative and specific.`;
}

export async function generateScenarioDraft(
  input: unknown,
  dependencies: GenerateScenarioDraftDependencies = {},
): Promise<GenerateScenarioDraftResponse> {
  const command = GenerateScenarioDraftCommandSchema.parse(input);
  const chatCompletionClient = dependencies.chatCompletionClient ?? new OpenAiCompatibleChatCompletionsClient();
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
  const name = command.name ?? normalizeDraftText(record.name, 200);

  if (name.length === 0) {
    throw new ProviderGenerationError('Provider returned a scenario draft without a name. Try again.');
  }

  if (content.length === 0) {
    throw new ProviderGenerationError('Provider returned a scenario draft without content. Try again.');
  }

  return GenerateScenarioDraftResponseSchema.parse({
    content,
    name,
    tags: normalizeDraftTags(record.tags),
  });
}
