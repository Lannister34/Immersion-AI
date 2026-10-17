import { describe, expect, it } from 'vitest';

import {
  anthropicMessage,
  anthropicMessageStream,
  eventStream,
  openAiChatCompletion,
  openAiChatStream,
  providerFailure,
} from './provider-responses.js';
import { createServerSentEventDataDecoder } from './server-sent-event-data.js';

async function eventDataOf(response: Response) {
  const decoder = createServerSentEventDataDecoder();
  const data = decoder.push(await response.text());
  decoder.end();

  return data;
}

describe('provider responses', () => {
  it('streams one OpenAI delta per event and closes the stream with [DONE]', async () => {
    const response = openAiChatStream([{ content: 'При' }, { reasoning_content: 'думаю' }]);

    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(await eventDataOf(response)).toEqual([
      '{"choices":[{"delta":{"content":"При"}}]}',
      '{"choices":[{"delta":{"reasoning_content":"думаю"}}]}',
      '[DONE]',
    ]);
  });

  it('frames raw event data as given, a malformed frame included', async () => {
    expect(await eventDataOf(eventStream(['{"choices":[]}', '{oops']))).toEqual(['{"choices":[]}', '{oops']);
  });

  it('names each Anthropic stream event in an event line before its data, as the Messages API does', async () => {
    const response = anthropicMessageStream([
      { type: 'message_start' },
      { delta: { text: 'Прив', type: 'text_delta' }, type: 'content_block_delta' },
    ]);

    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(await response.text()).toBe(
      [
        'event: message_start\ndata: {"type":"message_start"}\n\n',
        'event: content_block_delta\ndata: {"delta":{"text":"Прив","type":"text_delta"},"type":"content_block_delta"}\n\n',
      ].join(''),
    );
  });

  it('answers in the JSON shapes the OpenAI and Anthropic clients read', async () => {
    const completion = openAiChatCompletion('Привет.');
    const message = anthropicMessage('Привет от Claude.');
    const failure = providerFailure();

    expect(completion.status).toBe(200);
    expect(await completion.json()).toEqual({ choices: [{ message: { content: 'Привет.' } }] });
    expect(await message.json()).toEqual({ content: [{ text: 'Привет от Claude.', type: 'text' }] });
    expect(failure.status).toBe(500);
    expect(await failure.json()).toEqual({ error: 'provider failed' });
  });
});
