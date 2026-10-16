export interface AnthropicImageSource {
  data: string;
  media_type: string;
  type: 'base64';
}

export type AnthropicRole = 'assistant' | 'user';

export interface AnthropicMessage {
  content: Array<{ text: string; type: 'text' } | { source: AnthropicImageSource; type: 'image' }>;
  role: AnthropicRole;
}

export interface AnthropicPayload {
  conversation: AnthropicMessage[];
  system: string;
}
