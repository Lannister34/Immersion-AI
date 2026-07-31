import { type PromptVariableValues, renderPromptTemplate } from '@immersion/domain/prompting';

export interface ChatGreetingContext {
  characterDescription?: string | null;
  characterName?: string | null;
  characterPersonality?: string | null;
  scenarioContent?: string | null;
  userName: string;
}

/**
 * Приветствие приходит из карточки или сценария как шаблон, а в чат ложится
 * обычным сообщением — тем самым, что уходит в модель. Поэтому {{user}} и
 * {{char}} подставляем один раз, на входе, а не при каждом показе.
 */
export function renderChatGreeting(template: string, context: ChatGreetingContext): string {
  const values: PromptVariableValues = {
    'character.description': context.characterDescription ?? '',
    'character.name': context.characterName ?? '',
    'character.personality': context.characterPersonality ?? '',
    'scenario.content': context.scenarioContent ?? '',
    'user.name': context.userName,
  };

  return renderPromptTemplate(template, values).output.trim();
}
