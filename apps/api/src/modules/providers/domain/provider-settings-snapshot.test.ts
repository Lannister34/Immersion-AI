import { describe, expect, it } from 'vitest';

import { toProviderConfigView, toProviderSettingsSnapshot } from './provider-settings-snapshot.js';

describe('toProviderConfigView', () => {
  it('reports a stored key as configured without carrying it', () => {
    const view = toProviderConfigView({ apiKey: 'sk-secret', model: 'gpt-4o', url: 'https://api.openai.com' });

    expect(view).toEqual({ apiKeyConfigured: true, model: 'gpt-4o', url: 'https://api.openai.com' });
  });

  it('counts a key of spaces as not configured', () => {
    expect(toProviderConfigView({ apiKey: '   ', url: 'https://api.openai.com' }).apiKeyConfigured).toBe(false);
  });

  it('drops stored fields the view does not name', () => {
    const view = toProviderConfigView({ legacyToken: 'sk-legacy', url: 'http://127.0.0.1:5001' });

    expect(JSON.stringify(view)).not.toContain('sk-legacy');
  });
});

describe('toProviderSettingsSnapshot', () => {
  it('maps every stored provider config to its view', () => {
    const snapshot = toProviderSettingsSnapshot({
      activeProvider: 'anthropic',
      mode: 'external',
      providerConfigs: {
        anthropic: { apiKey: 'sk-ant-secret', url: 'https://api.anthropic.com/v1' },
        custom: { url: 'http://127.0.0.1:5001' },
      },
    });

    expect(snapshot.providerConfigs).toEqual({
      anthropic: { apiKeyConfigured: true, url: 'https://api.anthropic.com/v1' },
      custom: { apiKeyConfigured: false, url: 'http://127.0.0.1:5001' },
    });
    expect(JSON.stringify(snapshot)).not.toContain('sk-ant-secret');
  });
});
