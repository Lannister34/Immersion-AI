import { describe, expect, it } from 'vitest';

import { stubGlobalFetch } from '../../test-support/global-fetch-stub.js';
import { globalHttpFetch } from './global-http-fetch.js';

describe('globalHttpFetch', () => {
  it('sends the request through the fetch installed when it is called, not the one present at import', async () => {
    const url = 'http://127.0.0.1:59998/v1/chat/completions';
    const http = stubGlobalFetch();
    http.on('POST', url, () => Response.json({ choices: [{ message: { content: 'Привет' } }] }));

    const response = await globalHttpFetch(url, { body: JSON.stringify({ model: 'модель' }), method: 'POST' });

    expect(http.requests.map((request) => ({ body: JSON.parse(request.bodyText), url: request.url }))).toEqual([
      { body: { model: 'модель' }, url },
    ]);
    expect(await response.json()).toEqual({ choices: [{ message: { content: 'Привет' } }] });
  });
});
