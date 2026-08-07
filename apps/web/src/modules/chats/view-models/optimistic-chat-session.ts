import type { ChatMessageDto, ChatSessionDto } from '@immersion/contracts/chats';

// Оптимистично меняем только транскрипт. Сводные поля чата (messageCount,
// lastMessagePreview, updatedAt) принадлежат backend и обновляются
// инвалидацией session- и list-запросов после ответа сервера.

export interface OptimisticUserMessageInput {
  attachments?: ChatMessageDto['attachments'];
  content: string;
  createdAt: string;
  id: string;
}

export function appendOptimisticUserMessage(
  session: ChatSessionDto,
  input: OptimisticUserMessageInput,
): ChatSessionDto {
  const message: ChatMessageDto = {
    attachments: input.attachments ?? [],
    id: input.id,
    reasoning: null,
    role: 'user',
    content: input.content,
    createdAt: input.createdAt,
  };

  return {
    ...session,
    messages: [...session.messages, message],
  };
}

export function replaceOptimisticMessageContent(
  session: ChatSessionDto,
  messageIndex: number,
  content: string,
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

  return {
    ...session,
    messages: nextMessages,
  };
}

export function removeOptimisticMessageAtIndex(session: ChatSessionDto, messageIndex: number): ChatSessionDto {
  if (messageIndex < 1 || messageIndex > session.messages.length) {
    return session;
  }

  return {
    ...session,
    messages: [...session.messages.slice(0, messageIndex - 1), ...session.messages.slice(messageIndex)],
  };
}

export function truncateOptimisticMessagesFromIndex(session: ChatSessionDto, fromIndex: number): ChatSessionDto {
  const keep = Math.max(0, fromIndex - 1);
  if (keep >= session.messages.length) {
    return session;
  }

  return {
    ...session,
    messages: session.messages.slice(0, keep),
  };
}
