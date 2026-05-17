import type { ChatMessageDto, ChatSessionDto } from '@immersion/contracts/chats';

export interface OptimisticUserMessageInput {
  content: string;
  createdAt: string;
  id: string;
}

export function appendOptimisticUserMessage(
  session: ChatSessionDto,
  input: OptimisticUserMessageInput,
): ChatSessionDto {
  const message: ChatMessageDto = {
    id: input.id,
    role: 'user',
    content: input.content,
    createdAt: input.createdAt,
  };

  return {
    ...session,
    chat: {
      ...session.chat,
      updatedAt: input.createdAt,
      messageCount: session.chat.messageCount + 1,
      lastMessagePreview: input.content,
    },
    messages: [...session.messages, message],
  };
}

export function replaceOptimisticMessageContent(
  session: ChatSessionDto,
  messageIndex: number,
  content: string,
  updatedAt: string,
): ChatSessionDto {
  const targetIndex = messageIndex - 1;
  if (targetIndex < 0 || targetIndex >= session.messages.length) {
    return session;
  }

  const nextMessages = session.messages.map((message, index) => {
    if (index !== targetIndex) {
      return message;
    }
    return {
      ...message,
      content,
    };
  });
  const isLast = targetIndex === session.messages.length - 1;

  return {
    ...session,
    chat: {
      ...session.chat,
      updatedAt,
      ...(isLast ? { lastMessagePreview: content.slice(0, 160) } : {}),
    },
    messages: nextMessages,
  };
}

export function truncateOptimisticMessagesFromIndex(
  session: ChatSessionDto,
  fromIndex: number,
  updatedAt: string,
): ChatSessionDto {
  const keep = Math.max(0, fromIndex - 1);
  if (keep >= session.messages.length) {
    return session;
  }

  const nextMessages = session.messages.slice(0, keep);
  const last = nextMessages.at(-1);

  return {
    ...session,
    chat: {
      ...session.chat,
      updatedAt,
      messageCount: nextMessages.length,
      lastMessagePreview: last ? last.content.slice(0, 160) : null,
    },
    messages: nextMessages,
  };
}
