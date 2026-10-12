import { listChatFileStats, readChatSummaryWithSearchText } from '../../chats/index.js';
import { InMemoryChatIndex } from '../infrastructure/in-memory-chat-index.js';

let sharedChatIndex: InMemoryChatIndex | null = null;

export function getSharedChatIndex(): InMemoryChatIndex {
  sharedChatIndex ??= new InMemoryChatIndex({ listChatFileStats, readChatSummaryWithSearchText });

  return sharedChatIndex;
}
