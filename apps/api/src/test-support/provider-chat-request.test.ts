import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createHttpStub } from './http-stub.js';
import { readProviderChatRequest } from './provider-chat-request.js';

const PROVIDER_URL = 'http://127.0.0.1:6006/v1/chat/completions';

describe('readProviderChatRequest', () => {
  it('reads the body of the request at the index, keeping the fields its schema does not name', async () => {
    const http = createHttpStub();
    http.on('POST', PROVIDER_URL, () => Response.json({}));
    await http.fetch(PROVIDER_URL, { body: JSON.stringify({ messages: [], model: 'первая' }), method: 'POST' });
    await http.fetch(PROVIDER_URL, {
      body: JSON.stringify({ messages: [{ content: 'Привет.', role: 'user' }], min_p: 0.04, model: 'вторая' }),
      method: 'POST',
    });

    expect(readProviderChatRequest(http)).toEqual({ messages: [], model: 'первая' });
    expect(readProviderChatRequest(http, 1)).toEqual({
      messages: [{ content: 'Привет.', role: 'user' }],
      min_p: 0.04,
      model: 'вторая',
    });
  });

  it('fails, naming how many requests the stub saw, when there is no request at the index', async () => {
    const http = createHttpStub();
    http.on('POST', PROVIDER_URL, () => Response.json({}));
    await http.fetch(PROVIDER_URL, { body: JSON.stringify({ messages: [] }), method: 'POST' });

    expect(() => readProviderChatRequest(http, 1)).toThrow('No provider request #1 was recorded; the stub saw 1.');
  });

  it('fails on a body that is not a chat request instead of handing the test a misread one', async () => {
    const http = createHttpStub();
    http.on('POST', PROVIDER_URL, () => Response.json({}));
    await http.fetch(PROVIDER_URL, { body: JSON.stringify({ prompt: 'Привет.' }), method: 'POST' });

    expect(() => readProviderChatRequest(http)).toThrow(z.ZodError);
  });
});
