import { describe, expect, it } from 'vitest';

import { EMPTY_STREAMED_REPLY, reduceStreamedReply, type StreamedReplyEvent } from './streamed-reply';

function replay(events: StreamedReplyEvent[]) {
  return events.reduce(reduceStreamedReply, EMPTY_STREAMED_REPLY);
}

describe('reduceStreamedReply', () => {
  it('keeps reasoning and reply deltas on their own channels', () => {
    expect(
      replay([
        { channel: 'reasoning', delta: 'Думаю', type: 'delta' },
        { channel: 'reply', delta: 'Привет', type: 'delta' },
        { channel: 'reasoning', delta: ' дальше', type: 'delta' },
      ]),
    ).toEqual({ reasoning: 'Думаю дальше', reply: 'Привет' });
  });

  it('joins reply deltas in the order they arrive', () => {
    expect(
      replay([
        { channel: 'reply', delta: 'Пер', type: 'delta' },
        { channel: 'reply', delta: 'вый ', type: 'delta' },
        { channel: 'reply', delta: 'кусок.', type: 'delta' },
      ]).reply,
    ).toBe('Первый кусок.');
  });

  it('clears both channels when the reply finishes', () => {
    expect(
      replay([
        { channel: 'reasoning', delta: 'Думаю', type: 'delta' },
        { channel: 'reply', delta: 'Привет', type: 'delta' },
        { type: 'finished' },
      ]),
    ).toEqual({ reasoning: '', reply: '' });
  });
});
