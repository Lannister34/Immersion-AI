import type { OpenAiRequestMessage } from './openai-chat-completion-request-schema.js';
import { UnsupportedOpenAiFeatureError } from './unsupported-openai-feature-error.js';

function toPromptRole(role: string): 'assistant' | 'system' | 'user' {
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
