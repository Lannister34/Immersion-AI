import { getRouteApi } from '@tanstack/react-router';

import { ChatListScreen } from '../modules/chats';

const chatIndexRouteApi = getRouteApi('/chat');

export function ChatIndexRouteComponent() {
  const { character } = chatIndexRouteApi.useSearch();

  return <ChatListScreen characterFilter={character ?? null} />;
}
