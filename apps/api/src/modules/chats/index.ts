export const chatsModuleId = 'chats' as const;

export { appendChatMessages } from './application/append-chat-messages.js';
export { ChatTranscriptChangedError } from './application/chat-conflicts.js';
export type {
  ChatFileStatRecord,
  ChatSearchTextRecord,
  ChatSummaryWithSearchText,
} from './application/chat-read-model.js';
export { listChatFileStats, readChatSummaryWithSearchText } from './application/chat-read-model.js';
export type { ChatSummaryRecord } from './application/chat-records.js';
export { createChat } from './application/create-chat.js';
export { getChatSession } from './application/get-chat-session.js';
export { chatsRoutes } from './interface/http/routes.js';
