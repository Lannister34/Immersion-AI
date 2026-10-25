import { describe, expect, it } from 'vitest';

import { createHttpStub, type HttpStub } from '../../../test-support/http-stub.js';
import { createManualClock, type ManualClock } from '../../../test-support/manual-clock.js';
import { ProviderVisionProbe, resolveProviderOrigin } from './provider-vision-probe.js';

interface ProbeHarness {
  readonly probe: ProviderVisionProbe;
  readonly http: HttpStub;
  readonly clock: ManualClock;
}

function buildProbe(responses: Record<string, unknown>): ProbeHarness {
  const http = createHttpStub();
  const clock = createManualClock({ stepMs: 0 });

  for (const [url, payload] of Object.entries(responses)) {
    http.on('GET', url, () => Response.json(payload));
  }

  return { probe: new ProviderVisionProbe({ clock, httpFetch: http.fetch }), http, clock };
}

function requestedUrls(http: HttpStub): string[] {
  return http.requests.map((request) => request.url);
}

const TARGET = { baseUrl: 'http://127.0.0.1:5001', model: 'Qwen3-VL' };

describe('resolveProviderOrigin', () => {
  it('drops the OpenAI /v1 suffix so service endpoints resolve at the root', () => {
    expect(resolveProviderOrigin('http://localhost:1234/v1')).toBe('http://localhost:1234');
    expect(resolveProviderOrigin('http://localhost:1234/v1/')).toBe('http://localhost:1234');
    expect(resolveProviderOrigin('http://127.0.0.1:5001')).toBe('http://127.0.0.1:5001');
  });
});

describe('ProviderVisionProbe', () => {
  it('reads vision from the llama.cpp props endpoint', async () => {
    const { probe } = buildProbe({
      'http://127.0.0.1:5001/props': { modalities: { audio: false, vision: true } },
    });

    await expect(probe.getVisionSupport(TARGET)).resolves.toBe('supported');
  });

  it('asks for JSON through the HTTP port with an abort signal on the request', async () => {
    const { probe, http } = buildProbe({ 'http://127.0.0.1:5001/props': { modalities: { vision: true } } });

    await probe.getVisionSupport(TARGET);

    expect(http.requestLines()).toEqual(['GET http://127.0.0.1:5001/props']);
    expect(http.requests[0]?.headers.get('Accept')).toBe('application/json');
    expect(http.requests[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('reports a text-only llama.cpp model as unsupported', async () => {
    const { probe } = buildProbe({
      'http://127.0.0.1:5001/props': { modalities: { audio: false, vision: false } },
    });

    await expect(probe.getVisionSupport(TARGET)).resolves.toBe('unsupported');
  });

  it('falls back to the LM Studio model catalog when props says nothing', async () => {
    const { probe } = buildProbe({
      'http://127.0.0.1:5001/props': { model_path: 'whatever.gguf' },
      'http://127.0.0.1:5001/api/v1/models': {
        models: [
          { capabilities: { vision: false }, key: 'other-model', type: 'llm' },
          { capabilities: { trained_for_tool_use: true, vision: true }, key: 'Qwen3-VL', type: 'llm' },
        ],
      },
    });

    await expect(probe.getVisionSupport(TARGET)).resolves.toBe('supported');
  });

  it('understands the older LM Studio vlm model type', async () => {
    const { probe } = buildProbe({
      'http://127.0.0.1:5001/api/v0/models': { data: [{ id: 'Qwen3-VL', type: 'vlm' }] },
    });

    await expect(probe.getVisionSupport(TARGET)).resolves.toBe('supported');
  });

  it('stays unknown, not unsupported, for a server that answers nothing familiar, so images are not refused on a guess', async () => {
    const { probe } = buildProbe({});

    await expect(probe.getVisionSupport(TARGET)).resolves.toBe('unknown');
  });

  it('stays unknown when the catalog has no entry for the configured model', async () => {
    const { probe } = buildProbe({
      'http://127.0.0.1:5001/api/v1/models': { models: [{ capabilities: { vision: true }, key: 'another' }] },
    });

    await expect(probe.getVisionSupport(TARGET)).resolves.toBe('unknown');
  });

  it('answers for cloud providers by model name, without asking them', async () => {
    const { probe, http } = buildProbe({});
    const anthropic = { baseUrl: 'https://api.anthropic.com/v1', provider: 'anthropic' as const };
    const openai = { baseUrl: 'https://api.openai.com/v1', provider: 'openai' as const };

    await expect(probe.getVisionSupport({ ...anthropic, model: 'claude-sonnet-4-5' })).resolves.toBe('supported');
    await expect(probe.getVisionSupport({ ...openai, model: 'gpt-4o' })).resolves.toBe('supported');
    await expect(probe.getVisionSupport({ ...openai, model: 'gpt-3.5-turbo' })).resolves.toBe('unsupported');
    expect(http.requests).toEqual([]);
  });

  it('still probes the server when the provider is a local OpenAI-compatible one', async () => {
    const { probe } = buildProbe({ 'http://127.0.0.1:5001/props': { modalities: { vision: true } } });

    await expect(probe.getVisionSupport({ ...TARGET, provider: 'custom' })).resolves.toBe('supported');
  });

  it('caches a known answer instead of probing on every readiness poll', async () => {
    const { probe, http } = buildProbe({ 'http://127.0.0.1:5001/props': { modalities: { vision: true } } });

    await probe.getVisionSupport(TARGET);
    await probe.getVisionSupport(TARGET);

    expect(requestedUrls(http)).toEqual(['http://127.0.0.1:5001/props']);
  });

  it('asks again once a known answer is a minute old, since a foreign server can be restarted with other flags', async () => {
    const { probe, http, clock } = buildProbe({ 'http://127.0.0.1:5001/props': { modalities: { vision: true } } });

    await probe.getVisionSupport(TARGET);
    clock.advance(59_999);
    await probe.getVisionSupport(TARGET);
    clock.advance(1);
    await probe.getVisionSupport(TARGET);

    expect(requestedUrls(http)).toEqual(['http://127.0.0.1:5001/props', 'http://127.0.0.1:5001/props']);
  });

  it('asks again once an unknown answer is half a minute old, since the server may still be loading the model', async () => {
    const { probe, http, clock } = buildProbe({
      'http://127.0.0.1:5001/props': {},
      'http://127.0.0.1:5001/api/v1/models': {},
      'http://127.0.0.1:5001/api/v0/models': {},
    });
    const oneRound = [
      'http://127.0.0.1:5001/props',
      'http://127.0.0.1:5001/api/v1/models',
      'http://127.0.0.1:5001/api/v0/models',
    ];

    await probe.getVisionSupport(TARGET);
    clock.advance(29_999);
    await probe.getVisionSupport(TARGET);
    const callsBeforeExpiry = requestedUrls(http);
    clock.advance(1);
    await expect(probe.getVisionSupport(TARGET)).resolves.toBe('unknown');

    expect(callsBeforeExpiry).toEqual(oneRound);
    expect(requestedUrls(http)).toEqual([...oneRound, ...oneRound]);
  });

  it('probes again for another model on the same endpoint', async () => {
    const { probe, http } = buildProbe({ 'http://127.0.0.1:5001/props': { modalities: { vision: true } } });

    await probe.getVisionSupport(TARGET);
    await probe.getVisionSupport({ ...TARGET, model: 'another-model' });

    expect(http.requests).toHaveLength(2);
  });
});
