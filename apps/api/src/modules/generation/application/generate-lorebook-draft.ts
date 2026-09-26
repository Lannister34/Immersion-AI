import {
  type GeneratedLorebookEntryDraft,
  GenerateLorebookDraftCommandSchema,
  type GenerateLorebookDraftResponse,
  GenerateLorebookDraftResponseSchema,
} from '@immersion/contracts/generation';

import { createChatCompletionClient } from '../infrastructure/chat-completion-client-factory.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import {
  type DraftGenerationContext,
  normalizeDraftText,
  resolveDraftGenerationContext,
} from './draft-generation-support.js';
import { ProviderGenerationError } from './generation-errors.js';
import { asJsonRecord, extractJsonFromModelOutput } from './model-json-output.js';

export interface GenerateLorebookDraftDependencies {
  chatCompletionClient?: ChatCompletionClient;
  signal?: AbortSignal;
}

const LOREBOOK_DRAFT_MAX_TOKENS = 3000;
const LOREBOOK_ENTRY_MAX_COUNT = 20;
const LOREBOOK_ENTRY_KEY_MAX_COUNT = 100;

const LOREBOOK_DRAFT_SYSTEM_INSTRUCTION = {
  en: 'You are a worldbuilding assistant. Generate world info entries for a roleplay lorebook. Return ONLY valid JSON.',
  ru: 'Ты — помощник по построению миров. Генерируй записи лорбука для ролевой игры. Возвращай ТОЛЬКО валидный JSON.',
} as const;

function buildLorebookDraftPrompt(concept: string, entryCount: number, context: DraftGenerationContext): string {
  if (context.language === 'ru') {
    return `Создай лорбук с ${entryCount} записями для этого сеттинга: ${concept}

Верни JSON-объект:
{
  "name": "Короткое название лорбука",
  "entries": [
    {
      "keys": ["ключевое_слово1", "ключевое_слово2"],
      "comment": "Краткий заголовок записи (например: 'Столица', 'Система магии')",
      "content": "2-4 предложения лора, которые подставляются в чат при появлении ключевых слов"
    }
  ]
}

Каждая запись должна покрывать отдельный аспект мира: локации, фракции, персонажи, история, технологии/магия, культура. ${context.languageSentence}`;
  }

  return `Create a lorebook with ${entryCount} world info entries for this setting: ${concept}

Return a JSON object:
{
  "name": "Short lorebook title",
  "entries": [
    {
      "keys": ["keyword1", "keyword2"],
      "comment": "Entry title/description (short, like 'Capital City' or 'Magic System')",
      "content": "2-4 sentences of lore content that gets injected when keywords appear in chat"
    }
  ]
}

Each entry should cover a distinct aspect of the world. Cover: locations, factions, characters, history, technology/magic, culture. ${context.languageSentence}`;
}

function normalizeEntryKeys(entry: Record<string, unknown>): string[] {
  // Легаси-модели могут вернуть поле "key" (единственное число) или строку вместо массива.
  const rawKeys = entry.keys ?? entry.key;
  const keyValues = Array.isArray(rawKeys) ? rawKeys : [rawKeys];
  const keys: string[] = [];

  for (const keyValue of keyValues) {
    const key = normalizeDraftText(keyValue, 200);

    if (key.length > 0 && !keys.includes(key)) {
      keys.push(key);
    }

    if (keys.length >= LOREBOOK_ENTRY_KEY_MAX_COUNT) {
      break;
    }
  }

  return keys;
}

function normalizeLorebookEntries(parsed: Record<string, unknown>): GeneratedLorebookEntryDraft[] {
  const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const entries: GeneratedLorebookEntryDraft[] = [];

  for (const rawEntry of rawEntries) {
    if (typeof rawEntry !== 'object' || rawEntry === null || Array.isArray(rawEntry)) {
      continue;
    }

    const entryRecord = rawEntry as Record<string, unknown>;
    const content = normalizeDraftText(entryRecord.content, 20_000);

    if (content.length === 0) {
      continue;
    }

    const comment = normalizeDraftText(entryRecord.comment, 200);

    entries.push({
      ...(comment.length > 0 ? { comment } : {}),
      content,
      keys: normalizeEntryKeys(entryRecord),
    });

    if (entries.length >= LOREBOOK_ENTRY_MAX_COUNT) {
      break;
    }
  }

  return entries;
}

export async function generateLorebookDraft(
  input: unknown,
  dependencies: GenerateLorebookDraftDependencies = {},
): Promise<GenerateLorebookDraftResponse> {
  const command = GenerateLorebookDraftCommandSchema.parse(input);
  const chatCompletionClient = dependencies.chatCompletionClient ?? createChatCompletionClient();
  const context = await resolveDraftGenerationContext();
  const completion = await chatCompletionClient.completeChat({
    endpoint: context.endpoint,
    maxTokens: LOREBOOK_DRAFT_MAX_TOKENS,
    messages: [
      {
        role: 'system',
        content: LOREBOOK_DRAFT_SYSTEM_INSTRUCTION[context.language],
      },
      {
        role: 'user',
        content: buildLorebookDraftPrompt(command.concept, command.entryCount, context),
      },
    ],
    sampling: context.sampling,
    signal: dependencies.signal,
  });
  const record = asJsonRecord(extractJsonFromModelOutput(completion.content), 'a lorebook draft');
  const entries = normalizeLorebookEntries(record);
  const name = normalizeDraftText(record.name, 200);

  if (name.length === 0) {
    throw new ProviderGenerationError('Provider returned a lorebook draft without a name. Try again.');
  }

  if (entries.length === 0) {
    throw new ProviderGenerationError('Provider returned a lorebook draft without usable entries. Try again.');
  }

  return GenerateLorebookDraftResponseSchema.parse({
    entries,
    name,
  });
}
