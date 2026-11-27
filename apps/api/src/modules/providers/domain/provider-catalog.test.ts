import { describe, expect, it } from 'vitest';

import {
  getProviderApiKind,
  getProviderDefaultModel,
  getProviderDefaultUrl,
  isProviderApiKeyRequired,
  providerDefinitions,
} from './provider-catalog.js';

describe('provider catalog', () => {
  it('publishes the provider definitions the settings form renders', () => {
    expect(providerDefinitions).toStrictEqual([
      {
        apiKind: 'openai-compatible',
        type: 'koboldcpp',
        label: 'KoboldCpp API',
        fields: [
          {
            key: 'url',
            type: 'text',
            required: true,
            placeholder: 'http://127.0.0.1:5001',
            defaultValue: 'http://127.0.0.1:5001',
          },
          {
            key: 'model',
            type: 'text',
            required: false,
            placeholder: 'local-model',
            defaultValue: 'local-model',
          },
        ],
      },
      {
        apiKind: 'openai-compatible',
        type: 'custom',
        label: 'OpenAI-совместимый API',
        fields: [
          {
            key: 'url',
            type: 'text',
            required: true,
            placeholder: 'http://127.0.0.1:5001',
            defaultValue: 'http://127.0.0.1:5001',
          },
          {
            key: 'apiKey',
            type: 'password',
            required: false,
          },
          {
            key: 'model',
            type: 'text',
            required: false,
            placeholder: 'local-model',
            defaultValue: 'local-model',
          },
        ],
      },
      {
        apiKind: 'openai-cloud',
        type: 'openai',
        label: 'OpenAI API',
        fields: [
          {
            key: 'url',
            type: 'text',
            required: true,
            placeholder: 'https://api.openai.com/v1',
            defaultValue: 'https://api.openai.com/v1',
          },
          {
            key: 'apiKey',
            type: 'password',
            required: true,
            placeholder: 'sk-…',
          },
          {
            key: 'model',
            type: 'text',
            required: true,
            placeholder: 'gpt-4o',
          },
        ],
      },
      {
        apiKind: 'anthropic',
        type: 'anthropic',
        label: 'Anthropic API (Claude)',
        fields: [
          {
            key: 'url',
            type: 'text',
            required: true,
            placeholder: 'https://api.anthropic.com/v1',
            defaultValue: 'https://api.anthropic.com/v1',
          },
          {
            key: 'apiKey',
            type: 'password',
            required: true,
            placeholder: 'sk-ant-…',
          },
          {
            key: 'model',
            type: 'text',
            required: true,
            placeholder: 'claude-sonnet-4-5',
          },
        ],
      },
    ]);
  });

  it('requires a key only for the cloud providers', () => {
    expect(isProviderApiKeyRequired('anthropic')).toBe(true);
    expect(isProviderApiKeyRequired('openai')).toBe(true);
    expect(isProviderApiKeyRequired('custom')).toBe(false);
    expect(isProviderApiKeyRequired('koboldcpp')).toBe(false);
  });

  it('has no default model for the cloud providers', () => {
    expect(getProviderDefaultModel('anthropic')).toBeNull();
    expect(getProviderDefaultModel('openai')).toBeNull();
    expect(getProviderDefaultModel('custom')).toBe('local-model');
    expect(getProviderDefaultModel('koboldcpp')).toBe('local-model');
  });

  it('offers no key field for KoboldCpp', () => {
    const koboldcpp = providerDefinitions.find((definition) => definition.type === 'koboldcpp');

    expect(koboldcpp?.fields.map((field) => field.key)).toEqual(['url', 'model']);
  });

  it('defaults each provider to its own endpoint', () => {
    expect(getProviderDefaultUrl('koboldcpp')).toBe('http://127.0.0.1:5001');
    expect(getProviderDefaultUrl('custom')).toBe('http://127.0.0.1:5001');
    expect(getProviderDefaultUrl('openai')).toBe('https://api.openai.com/v1');
    expect(getProviderDefaultUrl('anthropic')).toBe('https://api.anthropic.com/v1');
  });

  it('marks Anthropic as the only non-OpenAI dialect', () => {
    expect(getProviderApiKind('anthropic')).toBe('anthropic');
    expect(getProviderApiKind('openai')).toBe('openai-cloud');
    expect(getProviderApiKind('custom')).toBe('openai-compatible');
    expect(getProviderApiKind('koboldcpp')).toBe('openai-compatible');
  });
});
