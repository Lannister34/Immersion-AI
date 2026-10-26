import type { ChatMessageDto, ChatSessionDto } from '@immersion/contracts/chats';

import type {
  AssistantMessageContinuation,
  ChatAttachmentReference,
  ChatMessageAppend,
  ChatSessionPort,
} from '../modules/generation/index.js';

type ChatReplySessionPort = Pick<
  ChatSessionPort,
  | 'appendAssistantMessageContinuation'
  | 'appendChatMessages'
  | 'getChatSession'
  | 'readChatAttachmentDataUrl'
  | 'resolveChatAttachments'
>;

const NO_SAMPLING_OVERRIDES: ChatSessionDto['generationSettings']['sampling'] = {
  contextTrimStrategy: null,
  maxContextLength: null,
  maxTokens: null,
  minP: null,
  presencePenalty: null,
  repeatPenalty: null,
  repeatPenaltyRange: null,
  temperature: null,
  topK: null,
  topP: null,
};

export class InMemoryChatSessions implements ChatReplySessionPort {
  readonly #sessions = new Map<string, ChatSessionDto>();

  create(chatId: string, createdAt: string): ChatSessionDto {
    const session: ChatSessionDto = {
      characterAvatarUrl: null,
      characterId: null,
      characterName: null,
      chat: {
        characterAvatarUrl: null,
        characterId: null,
        characterName: null,
        createdAt,
        id: chatId,
        lastMessagePreview: null,
        lorebookIds: [],
        messageCount: 0,
        scenarioId: null,
        scenarioName: null,
        title: 'Чат в памяти',
        updatedAt: createdAt,
      },
      generationSettings: {
        additionalInstructions: null,
        samplerPresetId: null,
        sampling: NO_SAMPLING_OVERRIDES,
        systemPrompt: null,
      },
      lorebookIds: [],
      messages: [],
      scenarioId: null,
      scenarioName: null,
      userName: 'Алексей',
    };
    this.#sessions.set(chatId, session);

    return structuredClone(session);
  }

  getChatSession(chatId: string): Promise<ChatSessionDto | null> {
    const session = this.#sessions.get(chatId);

    return Promise.resolve(session ? structuredClone(session) : null);
  }

  async appendChatMessages(
    chatId: string,
    messages: ChatMessageAppend[],
    options: { requireEmptyTranscript?: boolean } = {},
  ): Promise<ChatSessionDto> {
    const session = this.#require(chatId);

    if (options.requireEmptyTranscript && session.messages.length > 0) {
      throw new Error(`Chat ${chatId} already has messages.`);
    }

    for (const message of messages) {
      session.messages.push(this.#toMessage(chatId, session.messages.length + 1, message));
      session.chat.updatedAt = message.createdAt;
    }

    return this.#summarize(session);
  }

  async appendAssistantMessageContinuation(
    chatId: string,
    input: AssistantMessageContinuation,
  ): Promise<ChatSessionDto> {
    const session = this.#require(chatId);
    const lastMessage = session.messages.at(-1);

    if (
      session.messages.length !== input.expectedMessageIndex ||
      lastMessage?.role !== 'assistant' ||
      !lastMessage.content.startsWith(input.expectedContentPrefix)
    ) {
      throw new Error(`The last message of chat ${chatId} changed.`);
    }

    lastMessage.content += input.continuation;
    session.chat.updatedAt = input.updatedAt;

    return this.#summarize(session);
  }

  readChatAttachmentDataUrl(): Promise<string | null> {
    return Promise.resolve(null);
  }

  resolveChatAttachments(_chatId: string, attachmentIds: readonly string[]): Promise<ChatAttachmentReference[]> {
    return Promise.resolve(attachmentIds.map((id) => ({ id, mimeType: 'image/png' })));
  }

  #require(chatId: string): ChatSessionDto {
    const session = this.#sessions.get(chatId);

    if (!session) {
      throw new Error(`Chat ${chatId} does not exist in memory.`);
    }

    return session;
  }

  #toMessage(chatId: string, position: number, message: ChatMessageAppend): ChatMessageDto {
    return {
      attachments: (message.attachments ?? []).map((attachment) => ({
        ...attachment,
        url: `/api/chats/${chatId}/attachments/${attachment.id}`,
      })),
      content: message.content,
      createdAt: message.createdAt,
      id: `${chatId}-${position}`,
      reasoning: message.reasoning ?? null,
      role: message.role,
    };
  }

  #summarize(session: ChatSessionDto): ChatSessionDto {
    session.chat.messageCount = session.messages.length;
    session.chat.lastMessagePreview = session.messages.at(-1)?.content ?? null;

    return structuredClone(session);
  }
}
