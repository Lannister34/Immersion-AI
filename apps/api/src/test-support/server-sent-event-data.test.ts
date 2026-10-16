import { describe, expect, it } from 'vitest';

import { createServerSentEventDataDecoder } from './server-sent-event-data.js';

describe('createServerSentEventDataDecoder', () => {
  it('yields the data of each complete event and keeps a partial one for the next chunk', () => {
    const decoder = createServerSentEventDataDecoder();

    expect(decoder.push('event: generation.job.snapshot\ndata: {"статус":"в оч')).toEqual([]);
    expect(decoder.push('ереди"}\n\nevent: generation.job.updated\ndata: {"статус":"готово"}\n')).toEqual([
      '{"статус":"в очереди"}',
    ]);
    expect(decoder.push('\n')).toEqual(['{"статус":"готово"}']);
  });

  it('joins the data lines of one event with a newline and reads data without the optional space', () => {
    const decoder = createServerSentEventDataDecoder();

    expect(decoder.push('data: первая\ndata:вторая\n\ndata: [DONE]\n\n')).toEqual(['первая\nвторая', '[DONE]']);
  });

  it('reads CRLF-framed events, whichever chunk the line breaks land in', () => {
    const decoder = createServerSentEventDataDecoder();

    expect(decoder.push('data: первая\r\ndata: вторая\r')).toEqual([]);
    expect(decoder.push('\n\r')).toEqual([]);
    expect(decoder.push('\ndata: [DONE]\r\n\r\n')).toEqual(['первая\nвторая', '[DONE]']);
  });

  it('reads CR-framed events', () => {
    const decoder = createServerSentEventDataDecoder();

    expect(decoder.push('data: первая\rdata: вторая\r\rdata: [DONE]\r\r')).toEqual(['первая\nвторая', '[DONE]']);
  });

  it('fails at the end of a stream that stops inside an event, and passes after a complete one', () => {
    const complete = createServerSentEventDataDecoder();
    const truncated = createServerSentEventDataDecoder();

    complete.push('data: {"готово":true}\n\n\n');
    truncated.push('data: {"готово":true}\n\ndata: {"обрыв"');

    expect(() => complete.end()).not.toThrow();
    expect(() => truncated.end()).toThrow('The event stream ended inside an event: "data: {\\"обрыв\\""');
  });

  it('skips comments, such as the keepalive, and events that carry no data', () => {
    const decoder = createServerSentEventDataDecoder();

    expect(decoder.push(': keepalive\n\nevent: ping\n\ndata: {"oops\n\n')).toEqual(['{"oops']);
  });
});
