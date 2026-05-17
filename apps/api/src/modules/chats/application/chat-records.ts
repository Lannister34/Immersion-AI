export type ChatMessageRoleRecord = 'assistant' | 'system' | 'user';

export interface ChatMessageRecord {
  content: string;
  createdAt: string;
  id: string;
  role: ChatMessageRoleRecord;
}

export interface ChatSummaryRecord {
  characterId: string | null;
  characterName: string | null;
  createdAt: string;
  id: string;
  lastMessagePreview: string | null;
  messageCount: number;
  title: string;
  updatedAt: string;
}

export interface ChatSessionRecord {
  characterId: string | null;
  characterName: string | null;
  chat: ChatSummaryRecord;
  generationSettings: ChatGenerationSettingsRecord;
  messages: ChatMessageRecord[];
  userName: string | null;
}

export interface CreateGenericChatInput {
  characterId?: string | null;
  characterName?: string | null;
  createdAt: string;
  id: string;
  seedMessages?: AppendChatMessageInput[];
  title: string;
  userName: string;
}

export interface AppendChatMessageInput {
  content: string;
  createdAt: string;
  role: ChatMessageRoleRecord;
}

export type ChatContextTrimStrategyRecord = 'trim_middle' | 'trim_start';

export interface ChatSamplingOverridesRecord {
  contextTrimStrategy: ChatContextTrimStrategyRecord | null;
  maxContextLength: number | null;
  maxTokens: number | null;
  minP: number | null;
  presencePenalty: number | null;
  repeatPenalty: number | null;
  repeatPenaltyRange: number | null;
  temperature: number | null;
  topK: number | null;
  topP: number | null;
}

export interface ChatGenerationSettingsRecord {
  samplerPresetId: string | null;
  sampling: ChatSamplingOverridesRecord;
  systemPrompt: string | null;
}

export function createDefaultChatSamplingOverrides(): ChatSamplingOverridesRecord {
  return {
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
  };
}

export function createDefaultChatGenerationSettings(): ChatGenerationSettingsRecord {
  return {
    samplerPresetId: null,
    sampling: createDefaultChatSamplingOverrides(),
    systemPrompt: null,
  };
}
