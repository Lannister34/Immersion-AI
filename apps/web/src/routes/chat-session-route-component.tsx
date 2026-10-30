import { getRouteApi } from '@tanstack/react-router';

import { ChatSessionScreen } from '../modules/chats';

const chatSessionRouteApi = getRouteApi('/chat/$chatId');

export function ChatSessionRouteComponent() {
  const { chatId } = chatSessionRouteApi.useParams();

  return <ChatSessionScreen chatId={chatId} key={chatId} />;
}
