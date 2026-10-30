import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../test-support/render-with-providers';
import { CONTEXT_TRIM_FIELD, SAMPLER_PARAMETER_FIELDS } from '../../settings';
import {
  type AutoSavedGenerationSettings,
  INHERIT_PRESET_VALUE,
} from '../mutations/use-auto-saved-generation-settings';
import { createEmptySamplingDraft } from '../view-models/sampling-overrides';
import { ModelTab } from './model-tab';

const DEFAULT_PRESET: SettingsOverviewResponse['sampler']['presets'][number] = {
  contextTrimStrategy: 'trim_middle',
  id: 'default',
  maxContextLength: 8192,
  maxTokens: 512,
  minP: 0.05,
  name: 'Основной',
  presencePenalty: 0,
  repeatPenalty: 1.1,
  repeatPenaltyRange: 2048,
  temperature: 0.8,
  topK: 40,
  topP: 0.95,
};

const SETTINGS: SettingsOverviewResponse = {
  profile: {
    messageFormatting: { actionsItalic: true, quotesHighlighted: true },
    responseLanguage: 'ru',
    streamingEnabled: true,
    systemPromptTemplate: '',
    thinkingEnabled: false,
    userName: 'Миша',
    userPersona: '',
  },
  sampler: { activePresetId: 'default', modelBindingCount: 0, modelBindings: [], presets: [DEFAULT_PRESET] },
};

function createForm(): AutoSavedGenerationSettings {
  return {
    adoptSamplerPreset: vi.fn(),
    draft: {
      additionalInstructions: '',
      samplerPresetId: INHERIT_PRESET_VALUE,
      sampling: createEmptySamplingDraft(),
      systemPrompt: '',
    },
    errors: {},
    resetModelOverrides: vi.fn(),
    saveError: null,
    setAdditionalInstructions: vi.fn(),
    setSampling: vi.fn(),
    setSamplerPresetId: vi.fn(),
    setSystemPrompt: vi.fn(),
  };
}

async function renderModelTab(form: AutoSavedGenerationSettings) {
  return renderWithProviders(
    <ModelTab effectiveSampling={undefined} form={form} modelBindingPresetId={null} settings={SETTINGS} />,
  );
}

describe('ModelTab', () => {
  it('labels every sampling row and the trim select from the sampler catalog', async () => {
    await renderModelTab(createForm());

    for (const field of SAMPLER_PARAMETER_FIELDS) {
      expect(screen.getByText(field.label).closest('label')?.htmlFor).toBe(`chat-sampling-${field.key}`);
      expect(screen.getByText(field.hint)).toBeTruthy();
    }
    const trimSelect = screen.getByRole('combobox', { name: new RegExp(CONTEXT_TRIM_FIELD.label) });
    const offered = within(trimSelect)
      .getAllByRole('option')
      .map((option) => option.textContent);

    expect(screen.getByText(CONTEXT_TRIM_FIELD.hint)).toBeTruthy();
    expect(offered).toEqual(CONTEXT_TRIM_FIELD.options.map((option) => option.label));
  });

  it('steps a row by its catalog step from the inherited preset value', async () => {
    const form = createForm();
    await renderModelTab(form);

    fireEvent.click(screen.getByRole('button', { name: 'Уменьшить Max Length на 16' }));

    expect(form.setSampling).toHaveBeenCalledWith('maxTokens', '496');
  });
});
