import type { RuntimeOverviewResponse } from '@immersion/contracts/runtime';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../test-support/render-with-providers';
import { stubFetch } from '../../test-support/stub-fetch';
import { RootLayout } from './root-layout';

const MODEL_PATH = 'D:\\Модели\\mistral\\secondary.gguf';
const START_FAILURE = 'Process exited with code 1';

const FAILED_START: RuntimeOverviewResponse = {
  engine: { defaultModelsDir: 'D:\\Модели', executablePath: 'D:\\bin\\llama-server.exe', found: true },
  models: [],
  modelsDirsStatus: [],
  serverConfig: { contextSize: 8192, flashAttention: true, gpuLayers: 99, modelsDirs: [], port: 5001, threads: 0 },
  serverStatus: {
    error: START_FAILURE,
    model: 'secondary.gguf',
    modelPath: MODEL_PATH,
    pid: null,
    port: 5001,
    status: 'error',
  },
};

const SETTINGS: SettingsOverviewResponse = {
  profile: {
    messageFormatting: { actionsItalic: true, quotesHighlighted: true },
    responseLanguage: 'ru',
    streamingEnabled: true,
    systemPromptTemplate: '',
    thinkingEnabled: false,
    userName: 'Тестер',
    userPersona: '',
  },
  sampler: { activePresetId: 'default', modelBindingCount: 0, modelBindings: [], presets: [] },
};

const EMPTY_LIST = { items: [] };

const ANSWERS: Record<string, unknown> = {
  '/api/characters': EMPTY_LIST,
  '/api/chats': EMPTY_LIST,
  '/api/lorebooks': EMPTY_LIST,
  '/api/runtime/overview': FAILED_START,
  '/api/scenarios': EMPTY_LIST,
  '/api/settings/overview': SETTINGS,
};

describe('RootLayout', () => {
  it('shows a failed model start in the sidebar badge with its error', async () => {
    stubFetch().mockImplementation(async (input) => {
      const url = String(input);
      if (!(url in ANSWERS)) throw new Error(`The layout fake has no answer for ${url}.`);

      return new Response(JSON.stringify(ANSWERS[url]), { headers: { 'Content-Type': 'application/json' } });
    });

    await renderWithProviders(<RootLayout />);

    const badge = await screen.findByRole('link', { name: /Ошибка запуска/ });
    expect(badge.textContent).toContain(START_FAILURE);
  });
});
