import { z } from 'zod';

/**
 * Чужой контракт: это схема OpenAI Chat Completions, по которой к нам приходят
 * сторонние клиенты (ComfyUI, SillyTavern, curl). Поэтому она живёт в модуле,
 * а не в общем словаре contracts — веб её не знает и знать не должен.
 *
 * Неизвестные поля пропускаем молча: клиенты присылают много того, чего мы не
 * поддерживаем, и падать на каждом seed или logit_bias — худшее поведение, чем
 * ответить нормально. Отказываемся только там, где молчание дало бы клиенту
 * заведомо неверный результат.
 */
// Части разбираем по type, а не по форме: незнакомый вид части (audio, file)
// обязан пройти схему молча и быть пропущенным, а не уронить весь запрос.
export const OpenAiContentPartSchema = z.object({
  image_url: z.object({ url: z.string().min(1) }).optional(),
  text: z.string().optional(),
  type: z.string(),
});

export const OpenAiRequestMessageSchema = z.object({
  content: z
    .union([z.string(), z.array(OpenAiContentPartSchema)])
    .nullable()
    .optional(),
  role: z.string().min(1),
});
export type OpenAiRequestMessage = z.infer<typeof OpenAiRequestMessageSchema>;

export const OpenAiChatCompletionRequestSchema = z
  .object({
    max_completion_tokens: z.number().int().positive().optional(),
    max_tokens: z.number().int().positive().optional(),
    messages: z.array(OpenAiRequestMessageSchema).min(1),
    model: z.string().optional(),
    n: z.number().int().positive().optional(),
    presence_penalty: z.number().min(-2).max(2).optional(),
    stream: z.boolean().optional(),
    temperature: z.number().min(0).max(2).optional(),
    tool_choice: z.unknown().optional(),
    tools: z.array(z.unknown()).optional(),
    top_p: z.number().min(0).max(1).optional(),
  })
  .passthrough();
export type OpenAiChatCompletionRequest = z.infer<typeof OpenAiChatCompletionRequestSchema>;

export class UnsupportedOpenAiFeatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedOpenAiFeatureError';
  }
}

/** Роль модели: developer — новое имя system, tool и function мы не умеем. */
export function toPromptRole(role: string): 'assistant' | 'system' | 'user' {
  if (role === 'assistant') {
    return 'assistant';
  }

  if (role === 'system' || role === 'developer') {
    return 'system';
  }

  if (role === 'user') {
    return 'user';
  }

  throw new UnsupportedOpenAiFeatureError(`Role "${role}" is not supported; use system, user or assistant.`);
}

export interface NormalizedOpenAiMessage {
  content: string;
  images: string[];
  role: 'assistant' | 'system' | 'user';
}

function readContentParts(content: OpenAiRequestMessage['content']): { images: string[]; text: string } {
  if (typeof content === 'string') {
    return { images: [], text: content };
  }

  if (!Array.isArray(content)) {
    return { images: [], text: '' };
  }

  const texts: string[] = [];
  const images: string[] = [];

  for (const part of content) {
    if (part.type === 'text' && part.text) {
      texts.push(part.text);
    }

    if (part.type === 'image_url' && part.image_url) {
      images.push(part.image_url.url);
    }
  }

  return { images, text: texts.join('\n') };
}

/**
 * Приводит запрос к тому виду, в котором промпт уходит провайдеру: строка
 * текста плюс отдельный список картинок. Пустые сообщения выбрасываем — они
 * ничего не добавляют, а некоторые провайдеры на них ругаются.
 */
export function normalizeOpenAiMessages(messages: OpenAiRequestMessage[]): NormalizedOpenAiMessage[] {
  const normalized: NormalizedOpenAiMessage[] = [];

  for (const message of messages) {
    const role = toPromptRole(message.role);
    const { images, text } = readContentParts(message.content ?? '');

    if (text.trim().length === 0 && images.length === 0) {
      continue;
    }

    normalized.push({ content: text, images, role });
  }

  if (normalized.length === 0) {
    throw new UnsupportedOpenAiFeatureError('Request contains no message content.');
  }

  return normalized;
}

/**
 * То, чего мы не умеем и о чём обязаны сказать вслух: несколько вариантов
 * ответа и вызов инструментов. Промолчать здесь — значит вернуть клиенту не то,
 * что он попросил.
 */
export function assertSupportedRequest(request: OpenAiChatCompletionRequest): void {
  if (request.n !== undefined && request.n > 1) {
    throw new UnsupportedOpenAiFeatureError('Only one choice per request is supported; drop "n" or set it to 1.');
  }

  if (request.tools?.length || request.tool_choice) {
    throw new UnsupportedOpenAiFeatureError('Tool calls are not supported by this endpoint.');
  }
}
