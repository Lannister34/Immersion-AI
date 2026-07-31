import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { ApiProblem } from '@immersion/contracts/common';

export class ProviderGenerationError extends Error {
  constructor(message = 'Provider failed to generate a reply.') {
    super(message);
    this.name = 'ProviderGenerationError';
  }
}

export class ChatTranscriptEmptyError extends Error {
  constructor(readonly chatId: string) {
    super('Chat has no messages to derive a title from.');
    this.name = 'ChatTranscriptEmptyError';
  }
}

export class ChatNotEmptyError extends Error {
  constructor(readonly chatId: string) {
    super('Chat already has messages; a first message can only be generated for an empty chat.');
    this.name = 'ChatNotEmptyError';
  }
}

export class NothingToContinueError extends Error {
  constructor(readonly chatId: string) {
    super('The last chat message must be a non-empty assistant reply to continue it.');
    this.name = 'NothingToContinueError';
  }
}

export class NothingToAnswerError extends Error {
  constructor(readonly chatId: string) {
    super('The last chat message must be a non-empty user message to answer it.');
    this.name = 'NothingToAnswerError';
  }
}

export class ChatReplyGenerationFailedError extends Error {
  declare readonly session: ChatSessionDto;

  constructor(
    readonly statusCode: number,
    readonly code: ApiProblem['code'],
    message: string,
    session: ChatSessionDto,
  ) {
    super(message);
    this.name = 'ChatReplyGenerationFailedError';
    Object.defineProperty(this, 'session', {
      value: session,
      enumerable: false,
      writable: false,
    });
  }
}
