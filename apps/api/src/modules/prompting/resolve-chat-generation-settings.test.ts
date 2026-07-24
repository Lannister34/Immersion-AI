import type { ChatGenerationSettingsDto } from '@immersion/contracts/chats';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { describe, expect, it } from 'vitest';

import { resolveChatGenerationSettings } from './application/resolve-chat-generation-settings.js';

const settings: SettingsOverviewResponse = {
  profile: {
    responseLanguage: 'none',
    streamingEnabled: true,
    systemPromptTemplate: '',
    thinkingEnabled: true,
    messageFormatting: { actionsItalic: true, quotesHighlighted: false },
    uiLanguage: 'ru',
    userName: 'Tester',
    userPersona: '',
  },
  sampler: {
    activePresetId: 'active',
    modelBindingCount: 1,
    modelBindings: [
      {
        modelName: 'bound-model',
        presetId: 'bound',
      },
    ],
    presets: [
      {
        contextTrimStrategy: 'trim_middle',
        id: 'active',
        maxContextLength: 8192,
        maxTokens: 600,
        minP: 0.02,
        name: 'Active',
        presencePenalty: 0,
        repeatPenalty: 1.05,
        repeatPenaltyRange: 2048,
        temperature: 0.7,
        topK: 0,
        topP: 1,
      },
      {
        contextTrimStrategy: 'trim_start',
        id: 'bound',
        maxContextLength: 4096,
        maxTokens: 500,
        minP: 0.03,
        name: 'Bound',
        presencePenalty: 0.1,
        repeatPenalty: 1.1,
        repeatPenaltyRange: 1024,
        temperature: 0.4,
        topK: 20,
        topP: 0.9,
      },
      {
        contextTrimStrategy: 'trim_middle',
        id: 'chat',
        maxContextLength: 2048,
        maxTokens: 300,
        minP: 0.04,
        name: 'Chat',
        presencePenalty: 0.2,
        repeatPenalty: 1.2,
        repeatPenaltyRange: 512,
        temperature: 0.2,
        topK: 40,
        topP: 0.8,
      },
    ],
  },
};

const emptyChatSettings: ChatGenerationSettingsDto = {
  samplerPresetId: null,
  sampling: {
    contextTrimStrategy: null,
    maxContextLength: null,
    maxTokens: null,
    minP: null,
    presencePenalty: null,
    repeatPenalty: null,
    repeatPenaltyRange: null,
    temperature: null,
    topK: null,
    topP: null,
  },
  systemPrompt: null,
};

describe('resolveChatGenerationSettings', () => {
  it('uses a chat-selected sampler preset before a model-bound preset', () => {
    const resolved = resolveChatGenerationSettings(settings, 'bound-model', {
      ...emptyChatSettings,
      samplerPresetId: 'chat',
    });

    expect(resolved).toMatchObject({
      modelBindingPresetId: null,
      samplerPreset: {
        id: 'chat',
      },
      samplerPresetSource: 'chat_preset',
      sampling: {
        maxContextLength: 2048,
        maxTokens: 300,
        temperature: 0.2,
      },
    });
  });

  it('uses a model-bound preset before the active preset', () => {
    const resolved = resolveChatGenerationSettings(settings, 'bound-model', emptyChatSettings);

    expect(resolved).toMatchObject({
      modelBindingPresetId: 'bound',
      samplerPreset: {
        id: 'bound',
      },
      samplerPresetSource: 'model_binding',
    });
  });

  it('fails when a chat references a stale sampler preset', () => {
    expect(() =>
      resolveChatGenerationSettings(settings, 'unbound-model', {
        ...emptyChatSettings,
        samplerPresetId: 'missing',
      }),
    ).toThrowError('Chat sampler preset not found: missing');
  });

  it('applies chat sampling overrides field by field over the selected preset', () => {
    const resolved = resolveChatGenerationSettings(settings, 'bound-model', {
      ...emptyChatSettings,
      sampling: {
        ...emptyChatSettings.sampling,
        maxContextLength: 1024,
        maxTokens: 128,
        temperature: 0.55,
      },
    });

    expect(resolved.appliedChatOverrides).toMatchObject({
      maxContextLength: true,
      maxTokens: true,
      temperature: true,
      topP: false,
    });
    expect(resolved.sampling).toMatchObject({
      maxContextLength: 1024,
      maxTokens: 128,
      temperature: 0.55,
      topP: 0.9,
    });
  });
});
