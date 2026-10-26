export const chatsModuleId = 'chats' as const;

export { appendChatMessages, ChatMessageNotFoundError, ChatNotFoundError } from './application/append-chat-messages.js';
export { readChatAttachmentDataUrl, resolveChatAttachments } from './application/chat-attachments.js';
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
export { listChatFileStats, readChatSummaryWithSearchText } from './application/chat-read-model.js';
export type { ChatSummaryRecord } from './application/chat-records.js';
export { appendAssistantMessageContinuation } from './application/continue-last-assistant-message.js';
export { createChat } from './application/create-chat.js';
export { getChatSession } from './application/get-chat-session.js';
export { deriveLastMessagePreview } from './application/last-message-preview.js';
export { truncateChatMessages } from './application/truncate-chat-messages.js';
export { updateChatTitle } from './application/update-chat-title.js';
export { chatsProblems } from './interface/http/chats-problems.js';
export { chatsRoutes } from './interface/http/routes.js';
