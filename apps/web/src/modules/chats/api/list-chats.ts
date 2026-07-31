import { ChatListResponseSchema } from '@immersion/contracts/chats';

import { apiGet } from '../../../shared/api/client';

export interface ListChatsParams {
  searchText?: string;
}

export function listChats(params: ListChatsParams = {}) {
  const search = params.searchText?.trim();
  const path = search ? `/api/chats?q=${encodeURIComponent(search)}` : '/api/chats';
  return apiGet(path, ChatListResponseSchema);
}
