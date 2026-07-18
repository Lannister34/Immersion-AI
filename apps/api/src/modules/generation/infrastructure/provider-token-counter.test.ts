import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProviderTokenCounter } from './provider-token-counter.js';

const BASE_URL = 'http://127.0.0.1:6021';

interface RecordedTokenizeRequest {
  body: string;
  url: string;
}

describe('ProviderTokenCounter', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockLlamaTokenize() {
    const requests: RecordedTokenizeRequest[] = [];

    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      const body = typeof init?.body === 'string' ? init.body : '';
      requests.push({ body, url });

      if (url === `${BASE_URL}/tokenize`) {
        const { content } = JSON.parse(body) as { content?: string };

        return new Response(JSON.stringify({ tokens: Array.from({ length: (content ?? '').length }, (_, i) => i) }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    return requests;
  }

  function mockKoboldTokenize() {
    const requests: RecordedTokenizeRequest[] = [];

    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      const body = typeof init?.body === 'string' ? init.body : '';
      requests.push({ body, url });

      if (url === `${BASE_URL}/api/extra/tokencount`) {
        const { prompt } = JSON.parse(body) as { prompt?: string };

        return new Response(JSON.stringify({ value: (prompt ?? '').length }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    return requests;
  }

  function buildCounter(now?: () => number) {
    return new ProviderTokenCounter({
      ...(now ? { now } : {}),
      resolveTokenizeTarget: () => Promise.resolve({ baseUrl: BASE_URL, model: null }),
    });
  }

  it('counts exactly via the llama-server dialect and serves repeats from the cache', async () => {
    const requests = mockLlamaTokenize();
    const counter = buildCounter();

    const first = await counter.countTokens(['abcd', 'ef']);

    expect(first).toEqual({ counts: [4, 2], method: 'exact' });
    // One detection probe plus one request per text.
    expect(requests.filter((request) => request.url.endsWith('/tokenize'))).toHaveLength(3);

    const second = await counter.countTokens(['abcd', 'ghi']);

    expect(second).toEqual({ counts: [4, 3], method: 'exact' });
    // 'abcd' is a cache hit: only 'ghi' triggers a new tokenize request.
    expect(requests.filter((request) => request.url.endsWith('/tokenize'))).toHaveLength(4);
    expect(requests.at(-1)?.body).toContain('ghi');
  });

  it('counts exactly via the KoboldCpp dialect when /tokenize is absent', async () => {
    const requests = mockKoboldTokenize();
    const counter = buildCounter();

    const result = await counter.countTokens(['abcde']);

    expect(result).toEqual({ counts: [5], method: 'exact' });
    // Detection first tries llama (404), then kobold.
    expect(requests.some((request) => request.url.endsWith('/tokenize'))).toBe(true);
    expect(requests.some((request) => request.url.endsWith('/api/extra/tokencount'))).toBe(true);
  });

  it('falls back to the heuristic and skips tokenize calls until the retry window passes', async () => {
    let currentTime = 1_000_000;
    const fetchMock = vi.fn(async () => {
      throw new Error('connection refused');
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const counter = buildCounter(() => currentTime);

    const first = await counter.countTokens(['abcdefgh']);

    // The exact formula of the historic heuristic: max(1, ceil(len / 4)).
    expect(first).toEqual({ counts: [2], method: 'approximate' });
    const callsAfterDetection = fetchMock.mock.calls.length;
    expect(callsAfterDetection).toBeGreaterThan(0);

    const second = await counter.countTokens(['abcdefgh']);

    expect(second.method).toBe('approximate');
    // Capability 'absent' is remembered: no new tokenize traffic.
    expect(fetchMock.mock.calls.length).toBe(callsAfterDetection);

    currentTime += 61_000;

    const third = await counter.countTokens(['abcdefgh']);

    expect(third.method).toBe('approximate');
    // The retry window passed, so detection probes the endpoint again.
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterDetection);
  });

  it('uses the heuristic without any provider traffic when no tokenize base URL resolves', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const counter = new ProviderTokenCounter({
      resolveTokenizeTarget: () => Promise.resolve(null),
    });

    const result = await counter.countTokens(['abcd', '']);

    expect(result).toEqual({ counts: [1, 1], method: 'approximate' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
