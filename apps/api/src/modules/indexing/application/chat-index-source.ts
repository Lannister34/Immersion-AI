import type { ChatFileStatRecord, ChatSummaryWithSearchText } from '../../chats/index.js';

export interface ChatIndexSource {
  listChatFileStats(): Promise<ChatFileStatRecord[]>;
  readChatSummaryWithSearchText(chatId: string): Promise<ChatSummaryWithSearchText | null>;
}
