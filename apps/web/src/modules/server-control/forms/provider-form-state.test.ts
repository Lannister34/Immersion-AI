import { describe, expect, it } from 'vitest';

import { configToFormState, toProviderSettingsPatch } from './provider-form-state';

describe('provider form state', () => {
  it('starts with no key typed and no removal requested, whatever is saved', () => {
    expect(
      configToFormState({ apiKeyConfigured: true, model: 'gpt-4o', url: 'https://api.openai.com/v1' }, undefined),
    ).toEqual({ clearApiKey: false, model: 'gpt-4o', newApiKey: '', url: 'https://api.openai.com/v1' });
  });

  it('omits the key when none was typed', () => {
    const patch = toProviderSettingsPatch('custom', {
      clearApiKey: false,
      model: ' local ',
      newApiKey: '   ',
      url: ' http://127.0.0.1:5001 ',
    });

    expect(patch).toEqual({ activeProvider: 'custom', config: { model: 'local', url: 'http://127.0.0.1:5001' } });
  });

  it('sends an empty key when removal was requested', () => {
    const patch = toProviderSettingsPatch('openai', {
      clearApiKey: true,
      model: 'gpt-4o',
      newApiKey: '',
      url: 'https://api.openai.com/v1',
    });

    expect(patch.config?.apiKey).toBe('');
  });

  it('sends an empty model so a cleared model falls back to the provider default', () => {
    const patch = toProviderSettingsPatch('custom', {
      clearApiKey: false,
      model: '',
      newApiKey: '',
      url: 'http://127.0.0.1:5001',
    });

    expect(patch.config?.model).toBe('');
  });
});
