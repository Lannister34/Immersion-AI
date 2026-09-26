import { describe, expect, it } from 'vitest';

import { findCloudProviderReadinessIssue } from './index.js';

describe('findCloudProviderReadinessIssue', () => {
  it('asks a cloud provider for its API key first', () => {
    expect(findCloudProviderReadinessIssue('anthropic', { url: 'https://api.anthropic.com/v1' })).toEqual({
      code: 'external_provider_api_key_missing',
      message: 'API-ключ провайдера не задан. Укажите его на странице API.',
    });
  });

  it('counts a key of spaces as missing', () => {
    expect(
      findCloudProviderReadinessIssue('openai', { apiKey: '   ', model: 'gpt-4o', url: 'https://api.openai.com' }),
    ).toMatchObject({ code: 'external_provider_api_key_missing' });
  });

  it('asks a cloud provider for a model, since cloud providers have no default one', () => {
    expect(findCloudProviderReadinessIssue('openai', { apiKey: 'sk-test', url: 'https://api.openai.com' })).toEqual({
      code: 'external_provider_model_missing',
      message: 'Модель провайдера не выбрана. Выберите её на странице API.',
    });
  });

  it('finds no issue for a cloud provider with a key and a model', () => {
    expect(
      findCloudProviderReadinessIssue('anthropic', {
        apiKey: 'sk-ant-test',
        model: 'claude-sonnet-4-5',
        url: 'https://api.anthropic.com/v1',
      }),
    ).toBeNull();
  });

  it('finds no issue for a local provider without a key or a model, which falls back to its default model', () => {
    expect(findCloudProviderReadinessIssue('koboldcpp', { url: 'http://127.0.0.1:5001' })).toBeNull();
  });
});
