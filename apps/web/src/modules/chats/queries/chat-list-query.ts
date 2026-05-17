import { keepPreviousData, queryOptions } from '@tanstack/react-query';

import { listChats } from '../api/list-chats';

export const chatListQueryKey = ['chats', 'list'] as const;

export function chatListQueryKeyForSearch(searchText = '') {
  const normalized = searchText.trim();
  return [...chatListQueryKey, normalized] as const;
}

export function chatListQueryOptions(searchText = '') {
  const normalized = searchText.trim();
  return queryOptions({
    queryKey: chatListQueryKeyForSearch(normalized),
    queryFn: () => listChats(normalized ? { searchText: normalized } : {}),
    placeholderData: keepPreviousData,
  });
}
