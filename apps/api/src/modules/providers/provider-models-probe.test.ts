import { describe, expect, it } from 'vitest';

import { createHttpStub } from '../../test-support/http-stub.js';
import { probeProviderModels } from './application/probe-provider-models.js';
import { getProviderApiKind, getProviderDefaultModel, isProviderApiKeyRequired } from './domain/provider-catalog.js';
import { createDefaultProviderSettings } from './domain/provider-settings.js';
import type { ProviderConfigs } from './domain/provider-settings-schema.js';

function storedProviderSettings(providerConfigs: ProviderConfigs = {}) {
  const defaults = createDefaultProviderSettings();

  return { read: () => ({ ...defaults, providerConfigs: { ...defaults.providerConfigs, ...providerConfigs } }) };
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
  it('lists Anthropic models from the same /v1/models data list, authenticating with x-api-key and the version header', async () => {
    const http = createHttpStub();
    http.on('GET', 'https://api.anthropic.com/v1/models', () => Response.json({ data: [{ id: 'claude-sonnet-4-5' }] }));

    const response = await probeProviderModels(
      { apiKey: 'sk-ant-test', provider: 'anthropic', url: 'https://api.anthropic.com/v1' },
      { httpFetch: http.fetch, providerSettings: storedProviderSettings() },
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
      { httpFetch: http.fetch, providerSettings: storedProviderSettings() },
    );

    expect(http.requestLines()).toEqual(['GET https://api.openai.com/v1/models']);
    expect(http.requests[0]?.headers.get('Authorization')).toBe('Bearer sk-test');
  });

  it('does not call a cloud provider without a key', async () => {
    const http = createHttpStub();

    const response = await probeProviderModels(
      { provider: 'openai', url: 'https://api.openai.com/v1' },
      { httpFetch: http.fetch, providerSettings: storedProviderSettings() },
    );

    expect(http.requests).toEqual([]);
    expect(response.issue?.code).toBe('provider_api_key_missing');
  });

  it('rejects a relative URL before touching the network', async () => {
    const http = createHttpStub();

    const response = await probeProviderModels(
      { provider: 'custom', url: '/v1' },
      { httpFetch: http.fetch, providerSettings: storedProviderSettings() },
    );

    expect(http.requests).toEqual([]);
    expect(response.issue?.code).toBe('provider_url_invalid');
  });

  it('probes the saved url with the stored key when no key is sent', async () => {
    const http = createHttpStub();
    http.on('GET', 'https://api.openai.com/v1/models', () => Response.json({ data: [{ id: 'gpt-4o' }] }));

    await probeProviderModels(
      { provider: 'openai', url: 'https://api.openai.com/v1' },
      {
        httpFetch: http.fetch,
        providerSettings: storedProviderSettings({ openai: { apiKey: 'sk-stored', url: 'https://api.openai.com' } }),
      },
    );

    expect(http.requests[0]?.headers.get('Authorization')).toBe('Bearer sk-stored');
  });

  it('never sends the stored key to an origin other than the saved one', async () => {
    const http = createHttpStub();
    http.on('GET', 'http://192.168.1.50:5001/v1/models', () => Response.json({ data: [{ id: 'local' }] }));

    await probeProviderModels(
      { provider: 'custom', url: 'http://192.168.1.50:5001' },
      {
        httpFetch: http.fetch,
        providerSettings: storedProviderSettings({ custom: { apiKey: 'sk-stored', url: 'http://127.0.0.1:5001' } }),
      },
    );

    expect(http.requestLines()).toEqual(['GET http://192.168.1.50:5001/v1/models']);
    expect(http.requests[0]?.headers.get('Authorization')).toBeNull();
  });

  it('probes with no key when an empty key is sent, even for the saved origin', async () => {
    const http = createHttpStub();
    http.on('GET', 'http://127.0.0.1:5001/v1/models', () => Response.json({ data: [{ id: 'local' }] }));

    await probeProviderModels(
      { apiKey: '', provider: 'custom', url: 'http://127.0.0.1:5001' },
      {
        httpFetch: http.fetch,
        providerSettings: storedProviderSettings({ custom: { apiKey: 'sk-stored', url: 'http://127.0.0.1:5001' } }),
      },
    );

    expect(http.requests[0]?.headers.get('Authorization')).toBeNull();
  });

  it('answers an unreachable provider with a fixed message, never the transport error text', async () => {
    const response = await probeProviderModels(
      { apiKey: 'sk-typed-secret', provider: 'custom', url: 'http://127.0.0.1:6001' },
      {
        httpFetch: () => Promise.reject(new TypeError('Headers.append: "Bearer sk-typed-secret" is invalid')),
        providerSettings: storedProviderSettings(),
      },
    );

    expect(response.issue).toEqual({ code: 'provider_unreachable', message: 'Провайдер недоступен.' });
    expect(JSON.stringify(response)).not.toContain('sk-typed-secret');
  });

  it('names the network error code of an unreachable provider', async () => {
    const refused = new TypeError('fetch failed', {
      cause: Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }),
    });

    const response = await probeProviderModels(
      { provider: 'custom', url: 'http://127.0.0.1:6001' },
      { httpFetch: () => Promise.reject(refused), providerSettings: storedProviderSettings() },
    );

    expect(response.issue?.message).toBe('Провайдер недоступен (ECONNREFUSED).');
  });
});
