import { describe, expect, it } from 'vitest';

import { mergeProviderConfig } from './merge-provider-config.js';
import type { ProviderConfig } from './provider-settings-schema.js';

const SAVED: ProviderConfig = { apiKey: 'sk-saved', model: 'gpt-4o', url: 'https://api.openai.com/v1' };

describe('mergeProviderConfig', () => {
  it('drops the saved key when the url moves to another server and no key comes with it', () => {
    expect(mergeProviderConfig(SAVED, { url: 'https://collector.example/v1' })).toEqual({
      model: 'gpt-4o',
      url: 'https://collector.example/v1',
    });
  });

  it.each([
    'http://api.openai.com/v1',
    'https://api.openai.com:8443/v1',
    'https://api.openai.com@collector.example/v1',
    'not a url',
  ])('drops the saved key for %s, another origin or none', (url) => {
    expect(mergeProviderConfig(SAVED, { url }).apiKey).toBeUndefined();
  });

  it.each([
    'https://api.openai.com/v1/',
    'https://API.openai.com/',
    'https://api.openai.com:443/proxy/v1',
  ])('keeps the saved key for %s, the same origin', (url) => {
    expect(mergeProviderConfig(SAVED, { url })).toEqual({ ...SAVED, url });
  });

  it('stores the key that comes with a move to another server', () => {
    expect(mergeProviderConfig(SAVED, { apiKey: ' sk-new ', url: 'https://collector.example/v1' })).toEqual({
      apiKey: 'sk-new',
      model: 'gpt-4o',
      url: 'https://collector.example/v1',
    });
  });

  it('clears the key on an empty one whether or not the server changes', () => {
    expect(mergeProviderConfig(SAVED, { apiKey: '' }).apiKey).toBeUndefined();
    expect(mergeProviderConfig(SAVED, { apiKey: '', url: 'https://collector.example' }).apiKey).toBeUndefined();
  });

  it('keeps the key when the url is resent unchanged, even one that is not a valid url', () => {
    const unreadable: ProviderConfig = { apiKey: 'sk-saved', url: 'not a url' };

    expect(mergeProviderConfig(unreadable, { url: 'not a url' })).toEqual(unreadable);
    expect(mergeProviderConfig(SAVED, { model: 'gpt-4o-mini', url: SAVED.url })).toEqual({
      ...SAVED,
      model: 'gpt-4o-mini',
    });
  });

  it('keeps the key when the patch leaves the url out', () => {
    expect(mergeProviderConfig(SAVED, { model: '' })).toEqual({ apiKey: 'sk-saved', url: SAVED.url });
    expect(mergeProviderConfig(SAVED, undefined)).toEqual(SAVED);
  });

  it('keeps stored fields beyond url, model and key', () => {
    const withExtra: ProviderConfig = { apiKey: 'sk-saved', model: 'gpt-4o', organization: 'org-1', url: SAVED.url };

    expect(mergeProviderConfig(withExtra, { url: 'https://collector.example' })).toEqual({
      model: 'gpt-4o',
      organization: 'org-1',
      url: 'https://collector.example',
    });
  });
});
