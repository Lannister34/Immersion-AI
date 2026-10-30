export const chatsModuleId = 'chats' as const;

export { ChatMessageNotFoundError, ChatNotFoundError } from './application/append-chat-messages.js';
export {
  ChatLastMessageChangedError,
  ChatTranscriptChangedError,
  ChatTranscriptNotEmptyError,
} from './application/chat-conflicts.js';
export type {
  ChatFileStatRecord,
  ChatSearchTextRecord,
  ChatSummaryWithSearchText,
} from './application/chat-read-model.js';
export type { ChatSummaryRecord } from './application/chat-records.js';
export type { ChatRepository } from './application/chat-repository.js';
export { deriveLastMessagePreview } from './application/last-message-preview.js';
export { type ChatsModule, type ChatsModuleDependencies, createChatsModule } from './chats-module.js';
export { FileChatRepository } from './infrastructure/file-chat-repository.js';
export { chatsProblems } from './interface/http/chats-problems.js';
