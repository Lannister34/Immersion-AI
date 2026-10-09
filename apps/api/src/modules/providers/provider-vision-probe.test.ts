import { describe, expect, it } from 'vitest';

import { ProviderVisionProbe, resolveProviderOrigin } from './infrastructure/provider-vision-probe.js';

function buildProbe(responses: Record<string, unknown>, calls: string[] = []) {
  return new ProviderVisionProbe({
    fetchJson: async (url) => {
      calls.push(url);
      if (!(url in responses)) {
        throw new Error(`No route: ${url}`);
      }
      return responses[url];
    },
  });
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
    const probe = buildProbe({
      'http://127.0.0.1:5001/props': { modalities: { audio: false, vision: true } },
    });

    await expect(probe.getVisionSupport(TARGET)).resolves.toBe('supported');
  });

  it('reports a text-only llama.cpp model as unsupported', async () => {
    const probe = buildProbe({
      'http://127.0.0.1:5001/props': { modalities: { audio: false, vision: false } },
    });

    await expect(probe.getVisionSupport(TARGET)).resolves.toBe('unsupported');
  });

  it('falls back to the LM Studio model catalog when props says nothing', async () => {
    const probe = buildProbe({
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
    const probe = buildProbe({
      'http://127.0.0.1:5001/api/v0/models': { data: [{ id: 'Qwen3-VL', type: 'vlm' }] },
    });

    await expect(probe.getVisionSupport(TARGET)).resolves.toBe('supported');
  });

  it('stays unknown, not unsupported, for a server that answers nothing familiar, so images are not refused on a guess', async () => {
    const probe = buildProbe({});

    await expect(probe.getVisionSupport(TARGET)).resolves.toBe('unknown');
  });

  it('stays unknown when the catalog has no entry for the configured model', async () => {
    const probe = buildProbe({
      'http://127.0.0.1:5001/api/v1/models': { models: [{ capabilities: { vision: true }, key: 'another' }] },
    });

    await expect(probe.getVisionSupport(TARGET)).resolves.toBe('unknown');
  });

  it('answers for cloud providers by model name, without asking them', async () => {
    const calls: string[] = [];
    const probe = buildProbe({}, calls);
    const anthropic = { baseUrl: 'https://api.anthropic.com/v1', provider: 'anthropic' as const };
    const openai = { baseUrl: 'https://api.openai.com/v1', provider: 'openai' as const };

    await expect(probe.getVisionSupport({ ...anthropic, model: 'claude-sonnet-4-5' })).resolves.toBe('supported');
    await expect(probe.getVisionSupport({ ...openai, model: 'gpt-4o' })).resolves.toBe('supported');
    await expect(probe.getVisionSupport({ ...openai, model: 'gpt-3.5-turbo' })).resolves.toBe('unsupported');
    expect(calls).toEqual([]);
  });

  it('still probes the server when the provider is a local OpenAI-compatible one', async () => {
    const probe = buildProbe({ 'http://127.0.0.1:5001/props': { modalities: { vision: true } } });

    await expect(probe.getVisionSupport({ ...TARGET, provider: 'custom' })).resolves.toBe('supported');
  });

  it('caches a known answer instead of probing on every readiness poll', async () => {
    const calls: string[] = [];
    const probe = buildProbe({ 'http://127.0.0.1:5001/props': { modalities: { vision: true } } }, calls);

    await probe.getVisionSupport(TARGET);
    await probe.getVisionSupport(TARGET);

    expect(calls).toEqual(['http://127.0.0.1:5001/props']);
  });

  it('asks again once a known answer is a minute old, since a foreign server can be restarted with other flags', async () => {
    const calls: string[] = [];
    let nowMs = 0;
    const probe = new ProviderVisionProbe({
      fetchJson: async (url) => {
        calls.push(url);

        return { modalities: { vision: true } };
      },
      now: () => nowMs,
    });

    await probe.getVisionSupport(TARGET);
    nowMs = 59_999;
    await probe.getVisionSupport(TARGET);
    nowMs = 60_000;
    await probe.getVisionSupport(TARGET);

    expect(calls).toEqual(['http://127.0.0.1:5001/props', 'http://127.0.0.1:5001/props']);
  });

  it('asks again once an unknown answer is half a minute old, since the server may still be loading the model', async () => {
    const calls: string[] = [];
    let nowMs = 0;
    const probe = new ProviderVisionProbe({
      fetchJson: async (url) => {
        calls.push(url);

        return {};
      },
      now: () => nowMs,
    });
    const oneRound = [
      'http://127.0.0.1:5001/props',
      'http://127.0.0.1:5001/api/v1/models',
      'http://127.0.0.1:5001/api/v0/models',
    ];

    await probe.getVisionSupport(TARGET);
    nowMs = 29_999;
    await probe.getVisionSupport(TARGET);
    const callsBeforeExpiry = [...calls];
    nowMs = 30_000;
    await expect(probe.getVisionSupport(TARGET)).resolves.toBe('unknown');

    expect(callsBeforeExpiry).toEqual(oneRound);
    expect(calls).toEqual([...oneRound, ...oneRound]);
  });

  it('probes again for another model on the same endpoint', async () => {
    const calls: string[] = [];
    const probe = buildProbe({ 'http://127.0.0.1:5001/props': { modalities: { vision: true } } }, calls);

    await probe.getVisionSupport(TARGET);
    await probe.getVisionSupport({ ...TARGET, model: 'another-model' });

    expect(calls).toHaveLength(2);
  });
});
