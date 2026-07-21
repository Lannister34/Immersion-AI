import type { ChatSummaryRecord } from '../../chats/index.js';
import type { ChatIndexQueryOptions } from '../infrastructure/in-memory-chat-index.js';
import { getSharedChatIndex } from './shared-chat-index.js';

/**
 * Список сводок чатов из перестраиваемой read-модели: индекс сам освежается
 * перед ответом, поэтому вызывающие модули не зависят от его «свежести».
 */
export async function listIndexedChatSummaries(options: ChatIndexQueryOptions = {}): Promise<ChatSummaryRecord[]> {
  return getSharedChatIndex().listChatSummaries(options);
}
