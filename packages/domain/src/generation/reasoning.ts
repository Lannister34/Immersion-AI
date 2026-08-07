export type ReplyChannel = 'reasoning' | 'reply';

export interface ReplyChunk {
  channel: ReplyChannel;
  text: string;
}

const OPEN_TAGS = ['<think>', '<thinking>'] as const;
const CLOSE_TAGS = ['</think>', '</thinking>'] as const;
/** Самый длинный тег: столько символов держим в буфере, чтобы не разрезать его пополам. */
const MAX_TAG_LENGTH = Math.max(...[...OPEN_TAGS, ...CLOSE_TAGS].map((tag) => tag.length));

function findTag(text: string, tags: readonly string[]): { index: number; tag: string } | null {
  let found: { index: number; tag: string } | null = null;

  for (const tag of tags) {
    const index = text.indexOf(tag);

    if (index !== -1 && (!found || index < found.index)) {
      found = { index, tag };
    }
  }

  return found;
}

/** Может ли хвост оказаться началом одного из тегов — тогда его рано отдавать. */
function tailMightStartTag(text: string, tags: readonly string[]): number {
  for (let keep = Math.min(MAX_TAG_LENGTH - 1, text.length); keep > 0; keep -= 1) {
    const tail = text.slice(text.length - keep);

    if (tags.some((tag) => tag.startsWith(tail))) {
      return keep;
    }
  }

  return 0;
}

/**
 * Делит ответ модели на размышления и собственно реплику. Модели-рассуждатели
 * оборачивают ход мысли в <think>…</think>, и в транскрипт он попадать не
 * должен: это черновик, а не то, что сказал персонаж.
 *
 * Разделитель потоковый: текст приходит кусками произвольной длины, и тег
 * легко разрезается между ними — поэтому подозрительный хвост придерживается
 * до следующего куска.
 */
export function createReplySplitter() {
  let buffer = '';
  let insideReasoning = false;

  const push = (text: string): ReplyChunk[] => {
    buffer += text;
    const chunks: ReplyChunk[] = [];

    while (buffer.length > 0) {
      if (insideReasoning) {
        const close = findTag(buffer, CLOSE_TAGS);

        if (!close) {
          const keep = tailMightStartTag(buffer, CLOSE_TAGS);
          const ready = buffer.slice(0, buffer.length - keep);
          buffer = buffer.slice(buffer.length - keep);

          if (ready.length > 0) {
            chunks.push({ channel: 'reasoning', text: ready });
          }

          break;
        }

        if (close.index > 0) {
          chunks.push({ channel: 'reasoning', text: buffer.slice(0, close.index) });
        }

        buffer = buffer.slice(close.index + close.tag.length);
        insideReasoning = false;
        continue;
      }

      const open = findTag(buffer, OPEN_TAGS);

      if (!open) {
        const keep = tailMightStartTag(buffer, OPEN_TAGS);
        const ready = buffer.slice(0, buffer.length - keep);
        buffer = buffer.slice(buffer.length - keep);

        if (ready.length > 0) {
          chunks.push({ channel: 'reply', text: ready });
        }

        break;
      }

      if (open.index > 0) {
        chunks.push({ channel: 'reply', text: buffer.slice(0, open.index) });
      }

      buffer = buffer.slice(open.index + open.tag.length);
      insideReasoning = true;
    }

    return chunks;
  };

  const flush = (): ReplyChunk[] => {
    if (buffer.length === 0) {
      return [];
    }

    // Незакрытый <think> в конце ответа — тоже размышление: модель не успела
    // закрыть тег, и выдавать это за реплику персонажа нельзя.
    const chunk: ReplyChunk = { channel: insideReasoning ? 'reasoning' : 'reply', text: buffer };
    buffer = '';

    return [chunk];
  };

  return { flush, push };
}

export interface SplitReply {
  content: string;
  reasoning: string;
}

/** Разовое деление целого ответа — тот же разделитель, но без потока. */
export function splitReply(text: string): SplitReply {
  const splitter = createReplySplitter();
  const chunks = [...splitter.push(text), ...splitter.flush()];

  return {
    content: chunks
      .filter((chunk) => chunk.channel === 'reply')
      .map((chunk) => chunk.text)
      .join('')
      .trim(),
    reasoning: chunks
      .filter((chunk) => chunk.channel === 'reasoning')
      .map((chunk) => chunk.text)
      .join('')
      .trim(),
  };
}
