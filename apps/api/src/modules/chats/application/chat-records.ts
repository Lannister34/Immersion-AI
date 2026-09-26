export type ChatMessageRoleRecord = 'assistant' | 'system' | 'user';

export type ChatAttachmentMimeTypeRecord = 'image/jpeg' | 'image/png' | 'image/webp';

/** Файл вложения лежит рядом с чатом; id — имя файла в его папке. */
export interface ChatMessageAttachmentRecord {
  id: string;
  mimeType: ChatAttachmentMimeTypeRecord;
}

export interface ChatMessageRecord {
  attachments: ChatMessageAttachmentRecord[];
  content: string;
  createdAt: string;
  id: string;
  reasoning: string | null;
  role: ChatMessageRoleRecord;
}

export interface ChatSummaryRecord {
  characterId: string | null;
  characterName: string | null;
  createdAt: string;
  id: string;
  lastMessagePreview: string | null;
  lorebookIds: string[];
  messageCount: number;
  scenarioId: string | null;
  scenarioName: string | null;
  title: string;
  updatedAt: string;
}

export interface ChatSessionRecord {
  characterId: string | null;
  characterName: string | null;
  scenarioId: string | null;
  scenarioName: string | null;
  lorebookIds: string[];
  chat: ChatSummaryRecord;
  generationSettings: ChatGenerationSettingsRecord;
  messages: ChatMessageRecord[];
  userName: string | null;
}

export interface CreateGenericChatInput {
  characterId?: string | null;
  characterName?: string | null;
  scenarioId?: string | null;
  scenarioName?: string | null;
  lorebookIds?: string[];
  createdAt: string;
  generationSettings?: ChatGenerationSettingsRecord;
  id: string;
  seedMessages?: AppendChatMessageInput[];
  title: string;
  userName: string;
}

export interface AppendChatMessageInput {
  attachments?: ChatMessageAttachmentRecord[];
  content: string;
  createdAt: string;
  reasoning?: string | null;
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
  additionalInstructions: string | null;
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
    additionalInstructions: null,
    samplerPresetId: null,
    sampling: createDefaultChatSamplingOverrides(),
    systemPrompt: null,
  };
}
