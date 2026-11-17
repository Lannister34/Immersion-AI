import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { ApiProblem } from '@immersion/contracts/common';

export class ProviderGenerationError extends Error {
  constructor(message = 'Provider failed to generate a reply.') {
    super(message);
    this.name = 'ProviderGenerationError';
  }
}

export class ProviderReplyTruncatedError extends ProviderGenerationError {
  constructor() {
    super('Ответ модели упёрся в лимит токенов и оборвался. Попробуйте ещё раз.');
    this.name = 'ProviderReplyTruncatedError';
  }
}

export interface PromptExceedsContextDetails {
  readonly contextWindow: number;
  readonly fixedPromptTokens: number;
  readonly maxTokens: number;
  readonly promptBudget: number;
  readonly reason: 'reply-exceeds-context' | 'system-exceeds-budget';
}

function describePromptExceedsContext(details: PromptExceedsContextDetails): string {
  if (details.reason === 'reply-exceeds-context') {
    return `Лимит ответа (${details.maxTokens}) не меньше окна контекста (${details.contextWindow}): для истории чата не остаётся места. Уменьшите лимит ответа, выберите «Без лимита» или увеличьте контекст.`;
  }

  return `Системный промпт и последнее сообщение (${details.fixedPromptTokens} токенов) не помещаются в бюджет промпта: окно контекста ${details.contextWindow} − лимит ответа ${details.maxTokens} = ${details.promptBudget}. Уменьшите лимит ответа или системный промпт, выберите «Без лимита» или увеличьте контекст.`;
}

export class PromptExceedsContextError extends Error {
  constructor(readonly details: PromptExceedsContextDetails) {
    super(describePromptExceedsContext(details));
    this.name = 'PromptExceedsContextError';
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

export class NoAssistantMessageToRegenerateError extends Error {
  constructor(chatId: string) {
    super(`Chat ${chatId} has no assistant message to regenerate.`);
    this.name = 'NoAssistantMessageToRegenerateError';
  }
}

export class GenerationJobNotFoundError extends Error {
  constructor(readonly jobId: string) {
    super(`Generation job not found: ${jobId}`);
    this.name = 'GenerationJobNotFoundError';
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
