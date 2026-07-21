export const chatsModuleId = 'chats' as const;

export type {
  ChatFileStatRecord,
  ChatSearchTextRecord,
  ChatSummaryWithSearchText,
} from './application/chat-read-model.js';
export { listChatFileStats, readChatSummaryWithSearchText } from './application/chat-read-model.js';
export type { ChatSummaryRecord } from './application/chat-records.js';
export { chatsRoutes } from './interface/http/routes.js';
