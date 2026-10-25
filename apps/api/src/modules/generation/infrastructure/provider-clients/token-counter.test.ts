import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createHttpStub, type HttpStub } from '../../../../test-support/http-stub.js';
import { createManualClock, type ManualClock } from '../../../../test-support/manual-clock.js';
import { ProviderTokenCounter } from './token-counter.js';

const BASE_URL = 'http://127.0.0.1:6021';
const TOKENIZE_URL = `${BASE_URL}/tokenize`;
const TOKEN_COUNT_URL = `${BASE_URL}/api/extra/tokencount`;
const COUNT_CACHE_CAPACITY = 4096;

const LlamaTokenizeRequestSchema = z.object({ content: z.string() });
const KoboldTokenCountRequestSchema = z.object({ prompt: z.string() });

function serveLlamaTokenize(http: HttpStub): void {
  http.on('POST', TOKENIZE_URL, (request) => {
    const { content } = request.json(LlamaTokenizeRequestSchema);

    return Response.json({ tokens: Array.from({ length: content.length }, (_, index) => index) });
  });
}

function serveKoboldTokenCount(http: HttpStub, llamaProbe: 'missing' | 'refused'): void {
  if (llamaProbe === 'missing') {
    http.on('POST', TOKENIZE_URL, () => new Response('not found', { status: 404 }));
  }

  http.on('POST', TOKEN_COUNT_URL, (request) =>
    Response.json({ value: request.json(KoboldTokenCountRequestSchema).prompt.length }),
  );
}

function tokenizedTexts(http: HttpStub): string[] {
  return http.requests.map((request) => request.json(LlamaTokenizeRequestSchema).content);
}

function buildCounter(http: HttpStub, clock: ManualClock = createManualClock()): ProviderTokenCounter {
  return new ProviderTokenCounter({
    clock,
    httpFetch: http.fetch,
    resolveTokenizeTarget: () => Promise.resolve({ baseUrl: BASE_URL, model: null }),
  });
}

describe('ProviderTokenCounter', () => {
  it('counts exactly via the llama-server dialect after a single probe and serves repeats from the cache', async () => {
    const http = createHttpStub();
    serveLlamaTokenize(http);
    const counter = buildCounter(http);

    const first = await counter.countTokens(['abcd', 'ef']);

    expect(first).toEqual({ counts: [4, 2], method: 'exact' });
    expect(tokenizedTexts(http)).toEqual(['', 'abcd', 'ef']);

    const second = await counter.countTokens(['abcd', 'ghi']);

    expect(second).toEqual({ counts: [4, 3], method: 'exact' });
    expect(tokenizedTexts(http)).toEqual(['', 'abcd', 'ef', 'ghi']);
  });

  it('counts exactly via the KoboldCpp dialect when /tokenize is absent', async () => {
    const http = createHttpStub();
    serveKoboldTokenCount(http, 'missing');
    const counter = buildCounter(http);

    const result = await counter.countTokens(['abcde']);

    expect(result).toEqual({ counts: [5], method: 'exact' });
    expect(http.requestLines()).toEqual([`POST ${TOKENIZE_URL}`, `POST ${TOKEN_COUNT_URL}`, `POST ${TOKEN_COUNT_URL}`]);
  });

  it('falls through to the KoboldCpp dialect when the llama-server probe is refused', async () => {
    const http = createHttpStub();
    serveKoboldTokenCount(http, 'refused');
    const counter = buildCounter(http);

    const result = await counter.countTokens(['abcde']);

    expect(result).toEqual({ counts: [5], method: 'exact' });
    expect(http.requestLines()).toEqual([`POST ${TOKENIZE_URL}`, `POST ${TOKEN_COUNT_URL}`, `POST ${TOKEN_COUNT_URL}`]);
  });

  it('counts a text again once a different model serves the same base URL', async () => {
    const http = createHttpStub();
    serveLlamaTokenize(http);
    let model = 'first.gguf';
    const counter = new ProviderTokenCounter({
      clock: createManualClock(),
      httpFetch: http.fetch,
      resolveTokenizeTarget: () => Promise.resolve({ baseUrl: BASE_URL, model }),
    });

    await counter.countTokens(['abcd']);
    model = 'second.gguf';
    await counter.countTokens(['abcd']);

    expect(tokenizedTexts(http)).toEqual(['', 'abcd', 'abcd']);
  });

  it('evicts the least recently counted text once the count cache is full', async () => {
    const http = createHttpStub();
    serveLlamaTokenize(http);
    const counter = buildCounter(http);

    await counter.countTokens(Array.from({ length: COUNT_CACHE_CAPACITY }, (_, index) => `text ${index}`));
    await counter.countTokens(['text 0']);
    await counter.countTokens(['one text too many']);
    const requestsBeforeRecount = http.requests.length;
    await counter.countTokens(['text 0', 'text 1']);

    expect(tokenizedTexts(http).slice(requestsBeforeRecount)).toEqual(['text 1']);
  });

  it('falls back to the chars/4 heuristic and skips tokenize calls until the retry window passes', async () => {
    const http = createHttpStub();
    const clock = createManualClock({ stepMs: 0 });
    const counter = buildCounter(http, clock);
    const detectionRound = [`POST ${TOKENIZE_URL}`, `POST ${TOKEN_COUNT_URL}`];

    const first = await counter.countTokens(['abcdefgh']);

    expect(first).toEqual({ counts: [2], method: 'approximate' });
    expect(http.requestLines()).toEqual(detectionRound);

    const second = await counter.countTokens(['abcdefgh']);

    expect(second.method).toBe('approximate');
    expect(http.requestLines()).toEqual(detectionRound);

    clock.advance(61_000);

    const third = await counter.countTokens(['abcdefgh']);

    expect(third.method).toBe('approximate');
    expect(http.requestLines()).toEqual([...detectionRound, ...detectionRound]);
  });

  it('uses the heuristic without any provider traffic when no tokenize base URL resolves', async () => {
    const http = createHttpStub();
    const counter = new ProviderTokenCounter({
      clock: createManualClock(),
      httpFetch: http.fetch,
      resolveTokenizeTarget: () => Promise.resolve(null),
    });

    const result = await counter.countTokens(['abcd', '']);

    expect(result).toEqual({ counts: [1, 1], method: 'approximate' });
    expect(http.requests).toEqual([]);
  });
});
