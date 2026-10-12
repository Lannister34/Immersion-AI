import type { ChatSummaryRecord } from '../../chats/index.js';
import type { ChatIndexQueryOptions } from '../infrastructure/in-memory-chat-index.js';
import { getSharedChatIndex } from './shared-chat-index.js';

export async function listIndexedChatSummaries(options: ChatIndexQueryOptions = {}): Promise<ChatSummaryRecord[]> {
  return getSharedChatIndex().listChatSummaries(options);
}
