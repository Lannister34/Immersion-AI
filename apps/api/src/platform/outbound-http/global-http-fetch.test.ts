import { describe, expect, it } from 'vitest';

import { stubProviderReply } from '../../test-support/recording-provider-stub.js';
import { globalHttpFetch } from './global-http-fetch.js';

describe('globalHttpFetch', () => {
  it('sends the request through the fetch installed when it is called, not the one present at import', async () => {
    const requests = stubProviderReply('Привет');
    const url = 'http://127.0.0.1:59998/v1/chat/completions';

    const response = await globalHttpFetch(url, { body: JSON.stringify({ model: 'модель' }), method: 'POST' });

    expect(requests).toEqual([{ body: { model: 'модель' }, url }]);
    expect(await response.json()).toEqual({ choices: [{ message: { content: 'Привет' } }] });
  });
});
