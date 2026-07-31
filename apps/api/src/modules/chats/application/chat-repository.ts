import type { ChatFileStatRecord, ChatSummaryWithSearchText } from './chat-read-model.js';
import type {
  AppendChatMessageInput,
  ChatGenerationSettingsRecord,
  ChatSessionRecord,
  ChatSummaryRecord,
  CreateGenericChatInput,
} from './chat-records.js';

export interface ForkGenericChatInput {
  createdAt: string;
  newChatId: string;
  sourceChatId: string;
  throughIndex: number;
  title: string;
}

export interface ListGenericChatsOptions {
  searchText?: string;
}

export interface AppendContinuationToLastAssistantMessageInput {
  continuation: string;
  expectedContentPrefix: string;
  expectedMessageIndex: number;
  updatedAt: string;
}

export interface ChatRepository {
  appendContinuationToLastAssistantMessage(
    chatId: string,
    input: AppendContinuationToLastAssistantMessageInput,
  ): Promise<ChatSessionRecord | null>;
  appendGenericChatMessages(chatId: string, messages: AppendChatMessageInput[]): Promise<ChatSessionRecord | null>;
  createGenericChat(input: CreateGenericChatInput): Promise<ChatSummaryRecord>;
  deleteGenericChat(chatId: string): Promise<boolean>;
  forkGenericChat(input: ForkGenericChatInput): Promise<ChatSummaryRecord | null>;
  getGenericChatSession(chatId: string): Promise<ChatSessionRecord | null>;
  listChatFileStats(): Promise<ChatFileStatRecord[]>;
  listGenericChats(options?: ListGenericChatsOptions): Promise<ChatSummaryRecord[]>;
  readChatSummaryWithSearchText(chatId: string): Promise<ChatSummaryWithSearchText | null>;
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
  updateGenericChatLorebooks(
    chatId: string,
    lorebookIds: string[],
    updatedAt: string,
  ): Promise<ChatSessionRecord | null>;
  updateGenericChatMessage(
    chatId: string,
    messageIndex: number,
    content: string,
    updatedAt: string,
  ): Promise<ChatSessionRecord | null>;
  updateGenericChatTitle(chatId: string, title: string, updatedAt: string): Promise<ChatSessionRecord | null>;
  updateGenericChatBindings(
    chatId: string,
    bindings: {
      characterId?: string | null;
      characterName?: string | null;
      scenarioId?: string | null;
      scenarioName?: string | null;
    },
    updatedAt: string,
  ): Promise<ChatSessionRecord | null>;
}
