export class ChatTranscriptNotEmptyError extends Error {
  constructor(readonly chatId: string) {
    super(`Chat transcript is no longer empty: ${chatId}`);
    this.name = 'ChatTranscriptNotEmptyError';
  }
}

export class ChatLastMessageChangedError extends Error {
  constructor(readonly chatId: string) {
    super(`Chat transcript changed while the continuation was being generated: ${chatId}`);
    this.name = 'ChatLastMessageChangedError';
  }
}

export class ChatTitleConflictError extends Error {
  constructor(readonly chatId: string) {
    super(`Chat title was changed concurrently: ${chatId}`);
    this.name = 'ChatTitleConflictError';
  }
}
