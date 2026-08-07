import { describe, expect, it, vi } from 'vitest';

import { probeProviderModels } from './application/test-provider-connection.js';
import { getProviderApiKind, getProviderDefaultModel, isProviderApiKeyRequired } from './domain/provider-catalog.js';

function mockFetcher(payload: unknown) {
  const calls: Array<{ headers: Record<string, string>; url: string }> = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ headers: (init?.headers ?? {}) as Record<string, string>, url: String(url) });

    return new Response(JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  });

  return { calls, fetcher: fetcher as unknown as typeof fetch };
}

describe('provider catalog', () => {
  it('requires a key and an explicit model for cloud providers only', () => {
    expect(isProviderApiKeyRequired('anthropic')).toBe(true);
    expect(isProviderApiKeyRequired('openai')).toBe(true);
    expect(isProviderApiKeyRequired('custom')).toBe(false);
    expect(getProviderDefaultModel('anthropic')).toBeNull();
    expect(getProviderDefaultModel('koboldcpp')).toBe('local-model');
  });

  it('marks Anthropic as the only non-OpenAI dialect', () => {
    expect(getProviderApiKind('anthropic')).toBe('anthropic');
    expect(getProviderApiKind('openai')).toBe('openai-cloud');
  });
});

describe('probeProviderModels', () => {
  it('authenticates Anthropic with x-api-key and the version header', async () => {
    const { calls, fetcher } = mockFetcher({ data: [{ id: 'claude-sonnet-4-5' }] });

    const response = await probeProviderModels(
      { apiKey: 'sk-ant-test', provider: 'anthropic', url: 'https://api.anthropic.com/v1' },
      { fetcher },
    );

    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/models');
    expect(calls[0]?.headers['x-api-key']).toBe('sk-ant-test');
    expect(calls[0]?.headers['anthropic-version']).toBe('2023-06-01');
    expect(response.models).toEqual([{ id: 'claude-sonnet-4-5' }]);
  });

  it('authenticates OpenAI with a bearer token', async () => {
    const { calls, fetcher } = mockFetcher({ data: [{ id: 'gpt-4o' }] });

    await probeProviderModels({ apiKey: 'sk-test', provider: 'openai', url: 'https://api.openai.com' }, { fetcher });

    expect(calls[0]?.url).toBe('https://api.openai.com/v1/models');
    expect(calls[0]?.headers.Authorization).toBe('Bearer sk-test');
  });

  it('does not call a cloud provider without a key', async () => {
    const { calls, fetcher } = mockFetcher({ data: [] });

    const response = await probeProviderModels({ provider: 'openai', url: 'https://api.openai.com/v1' }, { fetcher });

    expect(calls).toEqual([]);
    expect(response.issue?.code).toBe('provider_api_key_missing');
  });

  it('rejects a relative URL before touching the network', async () => {
    const { calls, fetcher } = mockFetcher({ data: [] });

    const response = await probeProviderModels({ provider: 'custom', url: '/v1' }, { fetcher });

    expect(calls).toEqual([]);
    expect(response.issue?.code).toBe('provider_url_invalid');
  });
});
