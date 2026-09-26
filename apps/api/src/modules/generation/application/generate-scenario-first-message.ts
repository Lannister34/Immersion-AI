import {
  type GenerateScenarioFirstMessageCommand,
  GenerateScenarioFirstMessageCommandSchema,
  type GenerateScenarioFirstMessageResponse,
  GenerateScenarioFirstMessageResponseSchema,
} from '@immersion/contracts/generation';

import { createChatCompletionClient } from '../infrastructure/chat-completion-client-factory.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import {
  buildGenderHint,
  buildPlayerContextBlock,
  type DraftGenerationContext,
  normalizeDraftText,
  replaceNamesWithPlaceholders,
  resolveDraftGenerationContext,
} from './draft-generation-support.js';
import { ProviderGenerationError } from './generation-errors.js';

export interface GenerateScenarioFirstMessageDependencies {
  chatCompletionClient?: ChatCompletionClient;
  signal?: AbortSignal;
}

// Как в легаси /ai-generation/first-message: короткое вступление, не полотно.
const SCENARIO_FIRST_MESSAGE_MAX_TOKENS = 512;
// Лимит повторяет SaveScenarioCommandSchema.firstMessage: результат обязан проходить сохранение.
const SCENARIO_FIRST_MESSAGE_MAX_LENGTH = 20_000;

// Портировано из легаси server/src/routes/ai-generation.ts (/first-message);
// вместо карточки персонажа контекстом служит сам сценарий.
const SCENARIO_FIRST_MESSAGE_SYSTEM_INSTRUCTION = {
  en: `You are a creative writing assistant for roleplay. Generate an opening message from {{char}}'s perspective to start a roleplay scene.
MANDATORY: Use the literal placeholders {{user}} and {{char}} — NEVER substitute real names.
Return ONLY the message text, no JSON, no field names, no extra formatting.`,
  ru: `Ты — помощник для ролевых игр. Сгенерируй вступительное сообщение от лица {{char}} для начала ролевой сцены.
ОБЯЗАТЕЛЬНО: Используй буквальные плейсхолдеры {{user}} и {{char}} — НИКОГДА не подставляй настоящие имена.
Возвращай ТОЛЬКО текст сообщения, без JSON, без названий полей, без лишнего форматирования.`,
} as const;

function buildScenarioFirstMessagePrompt(
  command: GenerateScenarioFirstMessageCommand,
  context: DraftGenerationContext,
): string {
  const genderHint = buildGenderHint(context);
  const playerContextBlock = buildPlayerContextBlock(context);

  if (context.language === 'ru') {
    let contextBlock = `Концепция сценария: ${command.concept}`;
    if (command.name) contextBlock += `\nНазвание сценария: ${command.name}`;
    if (command.content) contextBlock += `\n\nТекст сцены:\n${command.content}`;

    return `${contextBlock}${playerContextBlock}

Напиши вступительное ролевое сообщение от лица {{char}} для этой сцены. Включи действия {{char}} (в *звёздочках*) и при желании речь. Задай сцену и пригласи к взаимодействию.
Роли {{user}} и {{char}} бери строго из концепции и текста сцены — не меняй их местами. Если по концепции {{char}} приходит к {{user}}, то и первым говорит пришедший {{char}}, а не наоборот.

${genderHint}Используй соответствующие русские грамматические окончания. ${context.languageSentence}
Используй {{user}} и {{char}} как буквальные плейсхолдеры — они будут заменены при выполнении.`;
  }

  let contextBlock = `Scenario concept: ${command.concept}`;
  if (command.name) contextBlock += `\nScenario title: ${command.name}`;
  if (command.content) contextBlock += `\n\nScene text:\n${command.content}`;

  return `${contextBlock}${playerContextBlock}

Write an opening roleplay message from {{char}}'s perspective for this scene. Include {{char}}'s actions (in *asterisks*) and optionally speech. Set the scene and invite interaction.
Take the {{user}} and {{char}} roles strictly from the concept and scene text — do not swap them. If the concept has {{char}} coming to {{user}}, the opening is spoken by the arriving {{char}}, not the reverse.

${genderHint}Use appropriate grammatical forms. ${context.languageSentence}
Use {{user}} and {{char}} as literal placeholders — they will be substituted at runtime.`;
}

export async function generateScenarioFirstMessage(
  input: unknown,
  dependencies: GenerateScenarioFirstMessageDependencies = {},
): Promise<GenerateScenarioFirstMessageResponse> {
  const command = GenerateScenarioFirstMessageCommandSchema.parse(input);
  const chatCompletionClient = dependencies.chatCompletionClient ?? createChatCompletionClient();
  const context = await resolveDraftGenerationContext();
  const completion = await chatCompletionClient.completeChat({
    endpoint: context.endpoint,
    maxTokens: SCENARIO_FIRST_MESSAGE_MAX_TOKENS,
    messages: [
      {
        role: 'system',
        content: SCENARIO_FIRST_MESSAGE_SYSTEM_INSTRUCTION[context.language],
      },
      {
        role: 'user',
        content: buildScenarioFirstMessagePrompt(command, context),
      },
    ],
    sampling: context.sampling,
    signal: dependencies.signal,
  });
  // Пост-обработка как в легаси: возвращаем просочившееся имя игрока обратно в {{user}}.
  const value = replaceNamesWithPlaceholders(
    normalizeDraftText(completion.content, SCENARIO_FIRST_MESSAGE_MAX_LENGTH),
    null,
    context.userName,
  );

  if (value.length === 0) {
    throw new ProviderGenerationError('Provider returned an empty scenario first message. Try again.');
  }

  return GenerateScenarioFirstMessageResponseSchema.parse({ value });
}
