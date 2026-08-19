import { createReplySplitter, type ReplyChannel, type ReplyChunk } from '@immersion/domain/generation';
import { z } from 'zod';

import { resolveAnthropicMessagesUrl } from '../../providers/application/generation-provider.js';
import type {
  ChatCompletionClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from '../application/chat-completion-client.js';
import { ProviderGenerationError } from '../application/generation-errors.js';
import { buildRequestSignal, isAbortError, readProviderErrorText } from './provider-http.js';

/** Версия API фиксируется заголовком: Anthropic не считает её частью URL. */
const ANTHROPIC_VERSION = '2023-06-01';

// Блоки ответа разбираем по типу, а не по форме: незнакомые виды (tool_use,
// redacted_thinking) обязаны проходить схему молча, а не ронять генерацию.
const AnthropicContentBlockSchema = z.object({
  text: z.string().optional(),
  thinking: z.string().optional(),
  type: z.string(),
});

const AnthropicMessageResponseSchema = z.object({
  content: z.array(AnthropicContentBlockSchema),
});

const AnthropicStreamEventSchema = z.object({
  delta: AnthropicContentBlockSchema.optional(),
  error: z.object({ message: z.string().optional() }).optional(),
  type: z.string(),
});

interface AnthropicImageSource {
  data: string;
  media_type: string;
  type: 'base64';
}

/**
 * Anthropic принимает картинку разобранной на тип и байты, а не одной строкой
 * data-URL. Чужой формат ссылки молча не отправляем: лучше пропустить картинку,
 * чем получить 400 на весь запрос.
 */
function parseDataUrl(dataUrl: string): AnthropicImageSource | null {
  const match = /^data:(?<mediaType>[^;,]+);base64,(?<data>.+)$/su.exec(dataUrl);
  const mediaType = match?.groups?.mediaType;
  const data = match?.groups?.data;

  if (!mediaType || !data) {
    return null;
  }

  return { data, media_type: mediaType, type: 'base64' };
}

type AnthropicRole = 'assistant' | 'user';

interface AnthropicMessage {
  content: Array<{ text: string; type: 'text' } | { source: AnthropicImageSource; type: 'image' }>;
  role: AnthropicRole;
}

function buildMessageContent(message: ChatCompletionRequest['messages'][number]): AnthropicMessage['content'] {
  const images = (message.images ?? [])
    .map(parseDataUrl)
    .filter((source): source is AnthropicImageSource => source !== null)
    .map((source) => ({ source, type: 'image' as const }));

  return [...images, ...(message.content.trim().length > 0 ? [{ text: message.content, type: 'text' as const }] : [])];
}

/**
 * Anthropic держит системный текст отдельным полем, а диалог требует строго
 * чередующихся ролей, начиная с пользователя. Промпт мы собираем в общем
 * OpenAI-подобном виде, поэтому здесь его перекладываем: системные сообщения
 * склеиваем, соседние одинаковые роли объединяем, а разговор, начинающийся с
 * реплики персонажа, открываем коротким служебным ходом пользователя.
 */
export function buildAnthropicPayload(messages: ChatCompletionRequest['messages']) {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .filter((content) => content.trim().length > 0)
    .join('\n\n');

  const conversation: AnthropicMessage[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      continue;
    }

    const content = buildMessageContent(message);

    if (content.length === 0) {
      continue;
    }

    const previous = conversation.at(-1);

    if (previous?.role === message.role) {
      previous.content.push(...content);
      continue;
    }

    conversation.push({ content, role: message.role });
  }

  if (conversation[0]?.role === 'assistant') {
    conversation.unshift({ content: [{ text: '(Начало сцены.)', type: 'text' }], role: 'user' });
  }

  return { conversation, system };
}

/**
 * Anthropic ограничивает temperature единицей и не принимает штрафы за
 * повторы: параметры, которых в API нет, просто не отправляем, а выходящие за
 * диапазон — подрезаем. Молчаливая подмена лучше, чем 400 на каждой генерации.
 */
function buildSamplingPayload(sampling: ChatCompletionRequest['sampling']) {
  return {
    temperature: Math.min(Math.max(sampling.temperature, 0), 1),
    ...(sampling.topK > 0 ? { top_k: Math.round(sampling.topK) } : {}),
    ...(sampling.topP > 0 && sampling.topP < 1 ? { top_p: sampling.topP } : {}),
  };
}

function buildHeaders(apiKey: string | null) {
  return {
    ...(apiKey ? { 'x-api-key': apiKey } : {}),
    'anthropic-version': ANTHROPIC_VERSION,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

function readResponseBlocks(payload: z.infer<typeof AnthropicMessageResponseSchema>): ChatCompletionResponse {
  const parts: Record<ReplyChannel, string[]> = { reasoning: [], reply: [] };

  for (const block of payload.content) {
    if (block.type === 'text' && block.text) {
      parts.reply.push(block.text);
    }

    if (block.type === 'thinking' && block.thinking) {
      parts.reasoning.push(block.thinking);
    }
  }

  return { content: parts.reply.join('').trim(), reasoning: parts.reasoning.join('').trim() };
}

/**
 * Поток Anthropic — те же строки `data: {...}`, но с типом события внутри и без
 * завершающего `[DONE]`. Текст приходит кусками content_block_delta, мысли —
 * отдельным типом дельты; тег <think> в тексте всё равно пропускаем через
 * разделитель: локальные прокси иногда отдают его и в этом формате.
 */
async function readStreamedContent(
  response: Response,
  onDelta: (delta: string, channel: ReplyChannel) => void,
): Promise<ChatCompletionResponse> {
  const body = response.body;

  if (!body) {
    throw new ProviderGenerationError('Provider returned an empty stream.');
  }

  const decoder = new TextDecoder();
  const reader = body.getReader();
  const splitter = createReplySplitter();
  const collected: Record<ReplyChannel, string> = { reasoning: '', reply: '' };
  let buffer = '';

  const emit = (chunks: ReplyChunk[]) => {
    for (const chunk of chunks) {
      collected[chunk.channel] += chunk.text;
      onDelta(chunk.text, chunk.channel);
    }
  };

  const handleLine = (line: string) => {
    const trimmed = line.trim();

    if (!trimmed.startsWith('data:')) {
      return;
    }

    const parsed = AnthropicStreamEventSchema.safeParse(JSON.parse(trimmed.slice('data:'.length).trim()));

    if (!parsed.success) {
      return;
    }

    const event = parsed.data;

    if (event.type === 'error') {
      throw new ProviderGenerationError(event.error?.message ?? 'Provider stream reported an error.');
    }

    const delta = event.type === 'content_block_delta' ? event.delta : undefined;

    if (delta?.type === 'thinking_delta' && delta.thinking) {
      emit([{ channel: 'reasoning', text: delta.thinking }]);
    }

    if (delta?.type === 'text_delta' && delta.text) {
      emit(splitter.push(delta.text));
    }
  };

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      handleLine(line);
    }
  }

  if (buffer.trim().length > 0) {
    handleLine(buffer);
  }

  emit(splitter.flush());

  return { content: collected.reply.trim(), reasoning: collected.reasoning.trim() };
}

export class AnthropicMessagesClient implements ChatCompletionClient {
  async completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const streaming = Boolean(request.onDelta);
    const { conversation, system } = buildAnthropicPayload(request.messages);
    let response: Response;

    try {
      response = await fetch(resolveAnthropicMessagesUrl(request.endpoint), {
        method: 'POST',
        headers: buildHeaders(request.endpoint.apiKey),
        body: JSON.stringify({
          model: request.endpoint.model,
          messages: conversation,
          max_tokens: request.maxTokens,
          stream: streaming,
          ...(system ? { system } : {}),
          ...buildSamplingPayload(request.sampling),
        }),
        signal: buildRequestSignal(request.signal),
      });
    } catch (error) {
      if (request.signal?.aborted || isAbortError(error)) {
        throw error;
      }

      throw new ProviderGenerationError(error instanceof Error ? error.message : 'Provider request failed.');
    }

    if (!response.ok) {
      throw new ProviderGenerationError(
        `Provider returned HTTP ${response.status}${await readProviderErrorText(response)}`,
      );
    }

    const isEventStream = (response.headers.get('content-type') ?? '').includes('text/event-stream');

    if (streaming && isEventStream && request.onDelta) {
      let streamed: ChatCompletionResponse;

      try {
        streamed = await readStreamedContent(response, request.onDelta);
      } catch (error) {
        if (request.signal?.aborted || isAbortError(error)) {
          throw error;
        }

        throw new ProviderGenerationError(
          error instanceof Error ? `Provider stream failed: ${error.message}` : 'Provider stream failed.',
        );
      }

      if (!streamed.content && !request.allowEmptyContent) {
        throw new ProviderGenerationError('Provider returned an empty reply.');
      }

      return streamed;
    }

    let payload: z.infer<typeof AnthropicMessageResponseSchema>;

    try {
      payload = AnthropicMessageResponseSchema.parse(JSON.parse(await response.text()));
    } catch (error) {
      throw new ProviderGenerationError(
        error instanceof Error
          ? `Provider returned an invalid response: ${error.message}`
          : 'Provider returned an invalid response.',
      );
    }

    const completion = readResponseBlocks(payload);

    if (!completion.content && !request.allowEmptyContent) {
      throw new ProviderGenerationError('Provider returned an empty reply.');
    }

    return completion;
  }
}
