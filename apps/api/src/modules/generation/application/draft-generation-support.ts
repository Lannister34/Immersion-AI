import type { ChatGenerationSettingsDto } from '@immersion/contracts/chats';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';

import { resolveChatGenerationSettings } from '../../prompting/application/resolve-chat-generation-settings.js';
import {
  type GenerationProviderEndpoint,
  resolveGenerationProviderEndpoint,
} from '../../providers/application/generation-provider.js';
import { getSettingsOverview } from '../../settings/application/get-settings-overview.js';
import type { ChatCompletionSamplingOptions } from './chat-completion-client.js';

export type DraftPromptLanguage = 'en' | 'ru';

type ResponseLanguage = SettingsOverviewResponse['profile']['responseLanguage'];

export interface DraftGenerationContext {
  endpoint: GenerationProviderEndpoint;
  language: DraftPromptLanguage;
  languageSentence: string;
  sampling: ChatCompletionSamplingOptions;
  userName: string;
  userPersona: string;
}

// Драфт-генерация не привязана к чату, поэтому чатовых оверрайдов нет:
// работает активный пресет либо привязка пресета к модели.
const NO_CHAT_GENERATION_SETTINGS: ChatGenerationSettingsDto = {
  additionalInstructions: null,
  samplerPresetId: null,
  sampling: {
    contextTrimStrategy: null,
    maxContextLength: null,
    maxTokens: null,
    minP: null,
    presencePenalty: null,
    repeatPenalty: null,
    repeatPenaltyRange: null,
    temperature: null,
    topK: null,
    topP: null,
  },
  systemPrompt: null,
};

export function resolveDraftPromptLanguage(responseLanguage: ResponseLanguage): DraftPromptLanguage {
  return responseLanguage === 'en' ? 'en' : 'ru';
}

export function buildDraftLanguageSentence(responseLanguage: ResponseLanguage): string {
  if (responseLanguage === 'en') {
    return 'Write in English.';
  }

  if (responseLanguage === 'ru') {
    return 'Пиши на русском.';
  }

  return 'Пиши на том же языке, что и исходная концепция.';
}

export async function resolveDraftGenerationContext(): Promise<DraftGenerationContext> {
  const endpoint = await resolveGenerationProviderEndpoint();
  const settings = getSettingsOverview();
  const resolved = resolveChatGenerationSettings(settings, endpoint.model, NO_CHAT_GENERATION_SETTINGS);

  return {
    endpoint,
    language: resolveDraftPromptLanguage(settings.profile.responseLanguage),
    languageSentence: buildDraftLanguageSentence(settings.profile.responseLanguage),
    sampling: {
      minP: resolved.sampling.minP,
      presencePenalty: resolved.sampling.presencePenalty,
      repeatPenalty: resolved.sampling.repeatPenalty,
      repeatPenaltyRange: resolved.sampling.repeatPenaltyRange,
      temperature: resolved.sampling.temperature,
      topK: resolved.sampling.topK,
      topP: resolved.sampling.topP,
    },
    userName: settings.profile.userName,
    userPersona: settings.profile.userPersona,
  };
}

/** Prompt line asking the model to infer {{user}}'s grammatical gender from the player name. */
export function buildGenderHint(context: DraftGenerationContext): string {
  if (context.language === 'ru') {
    return context.userName.trim()
      ? `Определи грамматический род {{user}} по имени игрока "${context.userName.trim()}". `
      : 'По умолчанию используй мужской грамматический род для {{user}}. ';
  }

  return context.userName.trim()
    ? `Determine {{user}}'s grammatical gender from the player name "${context.userName.trim()}". `
    : 'Default to masculine grammatical gender for {{user}}. ';
}

/** Prompt block with player name/persona; the model must still write {{user}} in output. */
export function buildPlayerContextBlock(context: DraftGenerationContext): string {
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

/**
 * Builds a regex that matches a name in any Russian case form.
 * Strategy: strip the last vowel-like ending to get a stem, then match
 * stem + a known declension ending. The ending set is deliberately closed:
 * matching arbitrary Cyrillic tails turned names like «Вера» into false
 * positives on «верно»/«верхом». Non-Cyrillic names fall back to exact
 * word-boundary match.
 */
const RUSSIAN_DECLENSION_ENDINGS = '(?:ами|ями|ах|ях|ой|ей|ёй|ою|ею|ом|ем|ём|ью|ам|ям|[аяоеёиыуюй])?';

function nameToRegex(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

  if (/^[Ѐ-ӿ]+$/u.test(name) && name.length >= 3) {
    const stem = name.replace(/[аяоеёиыйьую]$/iu, '');

    if (stem.length >= 2) {
      const stemEscaped = stem.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

      return new RegExp(
        `(?<![\\u0400-\\u04FF])${stemEscaped}${RUSSIAN_DECLENSION_ENDINGS}(?![\\u0400-\\u04FF])`,
        'giu',
      );
    }
  }

  return new RegExp(`\\b${escaped}\\b`, 'giu');
}

/** Replaces real character/user names (including declined forms) with {{char}}/{{user}} placeholders. */
export function replaceNamesWithPlaceholders(
  text: string,
  characterName: string | null,
  userName: string | null,
): string {
  let result = text;

  if (characterName?.trim()) {
    result = result.replace(nameToRegex(characterName.trim()), '{{char}}');
  }

  if (userName?.trim()) {
    result = result.replace(nameToRegex(userName.trim()), '{{user}}');
  }

  return result;
}

/** Coerces a model-provided value to trimmed text capped at the contract limit. */
export function normalizeDraftText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLength);
}

const DRAFT_TAG_MAX_LENGTH = 60;
const DRAFT_TAGS_MAX_COUNT = 50;

/** Coerces a model-provided tags value to the contract tag shape. */
export function normalizeDraftTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const tags: string[] = [];

  for (const item of value) {
    const tag = normalizeDraftText(item, DRAFT_TAG_MAX_LENGTH);

    if (tag.length > 0 && !tags.includes(tag)) {
      tags.push(tag);
    }

    if (tags.length >= DRAFT_TAGS_MAX_COUNT) {
      break;
    }
  }

  return tags;
}
