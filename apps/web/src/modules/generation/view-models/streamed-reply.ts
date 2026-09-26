import type { ReplyChannel } from '@immersion/contracts/generation';

export interface StreamedReply {
  reasoning: string;
  reply: string;
}

export interface StreamedReplyDelta {
  channel: ReplyChannel;
  delta: string;
  type: 'delta';
}

export interface StreamedReplyFinished {
  type: 'finished';
}

export type StreamedReplyEvent = StreamedReplyDelta | StreamedReplyFinished;

export const EMPTY_STREAMED_REPLY: StreamedReply = { reasoning: '', reply: '' };

export function reduceStreamedReply(state: StreamedReply, event: StreamedReplyEvent): StreamedReply {
  if (event.type === 'finished') {
    return EMPTY_STREAMED_REPLY;
  }

  return event.channel === 'reasoning'
    ? { reasoning: state.reasoning + event.delta, reply: state.reply }
    : { reasoning: state.reasoning, reply: state.reply + event.delta };
}
