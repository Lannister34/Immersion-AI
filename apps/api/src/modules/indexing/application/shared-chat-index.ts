import { listChatFileStats, readChatSummaryWithSearchText } from '../../chats/index.js';
import { InMemoryChatIndex } from '../infrastructure/in-memory-chat-index.js';

let sharedChatIndex: InMemoryChatIndex | null = null;

/**
 * Единственный на процесс индекс чатов; строится лениво при первом запросе.
 * Источник — публичные read-model функции модуля chats, поэтому правила
 * разбора JSONL живут только у владельца файлов.
 */
export function getSharedChatIndex(): InMemoryChatIndex {
  sharedChatIndex ??= new InMemoryChatIndex({ listChatFileStats, readChatSummaryWithSearchText });

  return sharedChatIndex;
}
