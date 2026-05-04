import type {
  AppendChatMessageInput,
  ChatGenerationSettingsRecord,
  ChatSessionRecord,
  ChatSummaryRecord,
  CreateGenericChatInput,
} from './chat-records.js';

export interface ChatRepository {
  appendGenericChatMessages(chatId: string, messages: AppendChatMessageInput[]): Promise<ChatSessionRecord | null>;
  createGenericChat(input: CreateGenericChatInput): Promise<ChatSummaryRecord>;
  getGenericChatSession(chatId: string): Promise<ChatSessionRecord | null>;
  listGenericChats(): Promise<ChatSummaryRecord[]>;
  truncateGenericChatMessagesFromIndex(
    chatId: string,
    fromIndex: number,
    updatedAt: string,
  ): Promise<ChatSessionRecord | null>;
  updateGenericChatGenerationSettings(
    chatId: string,
    settings: ChatGenerationSettingsRecord,
    updatedAt: string,
  ): Promise<ChatSessionRecord | null>;
  updateGenericChatMessage(
    chatId: string,
    messageIndex: number,
    content: string,
    updatedAt: string,
  ): Promise<ChatSessionRecord | null>;
}
