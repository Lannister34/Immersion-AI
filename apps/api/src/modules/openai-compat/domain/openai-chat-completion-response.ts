export type OpenAiFinishReason = 'length' | 'stop';

export interface OpenAiAssistantMessage {
  content: string;
  reasoning_content?: string;
  role: 'assistant';
}

export interface OpenAiChatCompletionChoice {
  finish_reason: OpenAiFinishReason;
  index: number;
  message: OpenAiAssistantMessage;
}

export interface OpenAiUsage {
  completion_tokens: number;
  prompt_tokens: number;
  total_tokens: number;
}

export interface OpenAiChatCompletionResponse {
  choices: OpenAiChatCompletionChoice[];
  created: number;
  id: string;
  model: string;
  object: 'chat.completion';
  usage: OpenAiUsage;
}

export interface OpenAiChatCompletionDelta {
  content?: string;
  reasoning_content?: string;
  role?: 'assistant';
}

export interface OpenAiChatCompletionChunkChoice {
  delta: OpenAiChatCompletionDelta;
  finish_reason: OpenAiFinishReason | null;
  index: number;
}

export interface OpenAiChatCompletionChunk {
  choices: OpenAiChatCompletionChunkChoice[];
  created: number;
  id: string;
  model: string;
  object: 'chat.completion.chunk';
}
