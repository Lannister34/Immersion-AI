export const indexingModuleId = 'indexing' as const;

export type { ChatIndex } from './application/chat-index.js';
export type { ChatIndexSource } from './application/chat-index-source.js';
export { InMemoryChatIndex } from './infrastructure/in-memory-chat-index.js';
