import type { ChatSessionDto, ChatSummaryDto, GetChatSessionResponse } from '@immersion/contracts/chats';
import type { FastifyPluginAsync } from 'fastify';

import { appendChatMessages } from './application/append-chat-messages.js';
import { readChatAttachmentDataUrl, resolveChatAttachments } from './application/chat-attachments.js';
import type { AppendChatMessageInput, ChatMessageAttachmentRecord } from './application/chat-records.js';
import type {
  AppendContinuationToLastAssistantMessageInput,
  AppendGenericChatMessagesOptions,
} from './application/chat-repository.js';
import { appendAssistantMessageContinuation } from './application/continue-last-assistant-message.js';
import { getChatSession } from './application/get-chat-session.js';
import { type TruncateChatMessagesCommand, truncateChatMessages } from './application/truncate-chat-messages.js';
import { type UpdateChatTitleInput, updateChatTitle } from './application/update-chat-title.js';
import { type ChatsRoutesDependencies, createChatsRoutes } from './interface/http/routes.js';

export type ChatsModuleDependencies = ChatsRoutesDependencies;

export interface ChatsModule {
  readonly routes: FastifyPluginAsync;
  appendAssistantMessageContinuation(
    chatId: string,
    input: AppendContinuationToLastAssistantMessageInput,
  ): Promise<ChatSessionDto>;
  appendChatMessages(
    chatId: string,
    messages: AppendChatMessageInput[],
    options?: AppendGenericChatMessagesOptions,
  ): Promise<ChatSessionDto>;
  getChatSession(chatId: string): Promise<GetChatSessionResponse | null>;
  readChatAttachmentDataUrl(chatId: string, attachmentId: string): Promise<string | null>;
  resolveChatAttachments(chatId: string, attachmentIds: readonly string[]): Promise<ChatMessageAttachmentRecord[]>;
  truncateChatMessages(command: TruncateChatMessagesCommand): Promise<ChatSessionDto>;
  updateChatTitle(input: UpdateChatTitleInput): Promise<ChatSummaryDto>;
}

export function createChatsModule(dependencies: ChatsModuleDependencies): ChatsModule {
  return {
    routes: createChatsRoutes(dependencies),
    appendAssistantMessageContinuation: (chatId, input) =>
      appendAssistantMessageContinuation({ ...input, chatId }, dependencies),
    appendChatMessages: (chatId, messages, options = {}) =>
      appendChatMessages({ ...options, chatId, messages }, dependencies),
    getChatSession: (chatId) => getChatSession({ chatId }, dependencies),
    readChatAttachmentDataUrl: (chatId, attachmentId) =>
      readChatAttachmentDataUrl({ attachmentId, chatId }, dependencies),
    resolveChatAttachments: (chatId, attachmentIds) => resolveChatAttachments({ attachmentIds, chatId }, dependencies),
    truncateChatMessages: (command) => truncateChatMessages(command, dependencies),
    updateChatTitle: (input) => updateChatTitle(input, dependencies),
  };
}
