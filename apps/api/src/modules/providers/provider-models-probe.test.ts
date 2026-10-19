import { describe, expect, it } from 'vitest';

import { createHttpStub } from '../../test-support/http-stub.js';
import { probeProviderModels } from './application/probe-provider-models.js';
import { getProviderApiKind, getProviderDefaultModel, isProviderApiKeyRequired } from './domain/provider-catalog.js';

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
  it('lists Anthropic models from the same /v1/models data list, authenticating with x-api-key and the version header', async () => {
    const http = createHttpStub();
    http.on('GET', 'https://api.anthropic.com/v1/models', () => Response.json({ data: [{ id: 'claude-sonnet-4-5' }] }));

    const response = await probeProviderModels(
      { apiKey: 'sk-ant-test', provider: 'anthropic', url: 'https://api.anthropic.com/v1' },
      { fetcher: http.fetch },
    );

    expect(http.requestLines()).toEqual(['GET https://api.anthropic.com/v1/models']);
    expect(http.requests[0]?.headers.get('x-api-key')).toBe('sk-ant-test');
    expect(http.requests[0]?.headers.get('anthropic-version')).toBe('2023-06-01');
    expect(response.models).toEqual([{ id: 'claude-sonnet-4-5' }]);
  });

  it('authenticates OpenAI with a bearer token', async () => {
    const http = createHttpStub();
    http.on('GET', 'https://api.openai.com/v1/models', () => Response.json({ data: [{ id: 'gpt-4o' }] }));

    await probeProviderModels(
      { apiKey: 'sk-test', provider: 'openai', url: 'https://api.openai.com' },
      { fetcher: http.fetch },
    );

    expect(http.requestLines()).toEqual(['GET https://api.openai.com/v1/models']);
    expect(http.requests[0]?.headers.get('Authorization')).toBe('Bearer sk-test');
  });

  it('does not call a cloud provider without a key', async () => {
    const http = createHttpStub();

    const response = await probeProviderModels(
      { provider: 'openai', url: 'https://api.openai.com/v1' },
      { fetcher: http.fetch },
    );

    expect(http.requests).toEqual([]);
    expect(response.issue?.code).toBe('provider_api_key_missing');
  });

  it('rejects a relative URL before touching the network', async () => {
    const http = createHttpStub();

    const response = await probeProviderModels({ provider: 'custom', url: '/v1' }, { fetcher: http.fetch });

    expect(http.requests).toEqual([]);
    expect(response.issue?.code).toBe('provider_url_invalid');
  });
});
