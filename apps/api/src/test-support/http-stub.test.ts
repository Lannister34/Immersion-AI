import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createHttpStub } from './http-stub.js';

const PROVIDER_URL = 'http://127.0.0.1:6006/v1/chat/completions';

describe('createHttpStub', () => {
  it('records url, method, headers and body', async () => {
    const http = createHttpStub();
    http.on('POST', PROVIDER_URL, () => Response.json({ ok: true }));

    await http.fetch(PROVIDER_URL, {
      body: JSON.stringify({ prompt: 'Привет, мир' }),
      headers: { Authorization: 'Bearer secret-token' },
      method: 'post',
    });

    expect(http.requests).toHaveLength(1);
    expect(http.requests[0]).toMatchObject({ bodyText: '{"prompt":"Привет, мир"}', method: 'POST', url: PROVIDER_URL });
    expect(http.requests[0]?.headers.get('authorization')).toBe('Bearer secret-token');
    expect(http.fetch).toHaveBeenCalledOnce();
  });

  it('lists the requests it saw as method and url lines, in the order they came', async () => {
    const http = createHttpStub();
    http.on('GET', /\/v1\/models$/u, () => Response.json({ data: [] }));
    http.on('POST', PROVIDER_URL, () => Response.json({}));

    await http.fetch('http://127.0.0.1:6006/v1/models', {});
    await http.fetch(PROVIDER_URL, { method: 'post' });

    expect(http.requestLines()).toEqual(['GET http://127.0.0.1:6006/v1/models', `POST ${PROVIDER_URL}`]);
  });

  it('answers with the first matching responder', async () => {
    const http = createHttpStub();
    http.on('GET', 'http://127.0.0.1:6006/v1/models', () => Response.json({ source: 'exact' }));
    http.on('GET', /\/v1\/models$/u, () => Response.json({ source: 'pattern' }));
    http.on('GET', /\/v1\/models$/u, () => Response.json({ source: 'shadowed' }));

    const exact = await http.fetch('http://127.0.0.1:6006/v1/models', { method: 'GET' });
    const pattern = await http.fetch('https://api.openai.com/v1/models', {});

    expect(await exact.json()).toEqual({ source: 'exact' });
    expect(await pattern.json()).toEqual({ source: 'pattern' });
  });

  it('answers with a once responder for the first match only, then falls through to the next one', async () => {
    const http = createHttpStub();
    http.once('POST', PROVIDER_URL, () => Response.json({ reply: 'первый' }));
    http.once('POST', PROVIDER_URL, () => Response.json({ reply: 'второй' }));

    const first = await http.fetch(PROVIDER_URL, { method: 'POST' });
    const second = await http.fetch(PROVIDER_URL, { method: 'POST' });
    const third = http.fetch(PROVIDER_URL, { method: 'POST' });

    expect(await first.json()).toEqual({ reply: 'первый' });
    expect(await second.json()).toEqual({ reply: 'второй' });
    await expect(third).rejects.toThrow(new TypeError('fetch failed'));
  });

  it('rejects an unmatched request like a refused connection', async () => {
    const http = createHttpStub();
    http.on('GET', PROVIDER_URL, () => Response.json({}));

    const failure = http.fetch(PROVIDER_URL, { method: 'POST' });

    await expect(failure).rejects.toThrow(new TypeError('fetch failed'));
    expect(http.requestLines()).toEqual([`POST ${PROVIDER_URL}`]);
  });

  it('reads a JSON body through a schema', async () => {
    const http = createHttpStub();
    http.on('POST', PROVIDER_URL, () => Response.json({}));

    await http.fetch(PROVIDER_URL, { body: JSON.stringify({ max_tokens: 64, model: 'модель' }), method: 'POST' });

    expect(http.requests[0]?.json(z.object({ model: z.string() }))).toEqual({ model: 'модель' });
    expect(() => http.requests[0]?.json(z.object({ model: z.number() }))).toThrow(z.ZodError);
  });

  it('a held request rejects with AbortError when aborted', async () => {
    const http = createHttpStub();
    const held = http.hold('POST', PROVIDER_URL);
    const controller = new AbortController();

    const pending = http.fetch(PROVIDER_URL, { method: 'POST', signal: controller.signal });
    await held.started;
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(held.aborted).resolves.toBeUndefined();
  });

  it('answers a held request with the response it is released with, and holds only the first match', async () => {
    const http = createHttpStub();
    const held = http.hold('POST', PROVIDER_URL);
    http.on('POST', PROVIDER_URL, () => Response.json({ reply: 'second' }));

    const first = http.fetch(PROVIDER_URL, { method: 'POST', signal: new AbortController().signal });
    const startedRequest = await held.started;
    const second = await http.fetch(PROVIDER_URL, { method: 'POST' });
    held.release(Response.json({ reply: 'first' }));

    expect(startedRequest.url).toBe(PROVIDER_URL);
    expect(await (await first).json()).toEqual({ reply: 'first' });
    expect(await second.json()).toEqual({ reply: 'second' });
  });
});
