import { describe, expect, it } from 'vitest';

import { ChatTranscriptChangedError } from '../../application/chat-conflicts.js';
import { chatsProblems } from './chats-problems.js';

describe('chatsProblems', () => {
  it('answers a transcript changed since it was read with 409 chat_transcript_changed, saying nothing was removed', () => {
    expect(chatsProblems.map(new ChatTranscriptChangedError('ceramics-chat'))).toEqual({
      statusCode: 409,
      body: {
        code: 'chat_transcript_changed',
        message: 'Чат изменился во время запроса — ничего не удалено. Повторите попытку.',
      },
    });
  });
});
