import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../../test-support/render-with-providers';
import { SamplerCard } from './sampler-card';

const PRESET_DEFAULTS = {
  contextTrimStrategy: 'trim_middle',
  maxContextLength: 32_256,
  minP: 0.02,
  presencePenalty: 0,
  repeatPenalty: 1.05,
  repeatPenaltyRange: 2048,
  temperature: 1,
  topK: 0,
  topP: 1,
} as const;

const SETTINGS: SettingsOverviewResponse = {
  profile: {
    messageFormatting: { actionsItalic: true, quotesHighlighted: false },
    responseLanguage: 'ru',
    streamingEnabled: true,
    systemPromptTemplate: '',
    thinkingEnabled: true,
    userName: 'Тестер',
    userPersona: '',
  },
  sampler: {
    activePresetId: 'dlinnyy',
    modelBindingCount: 0,
    modelBindings: [],
    presets: [
      { ...PRESET_DEFAULTS, id: 'dlinnyy', maxTokens: 3000, name: 'Длинный' },
      { ...PRESET_DEFAULTS, id: 'artemis', maxTokens: 'unlimited', name: 'Artemis' },
    ],
  },
};

function limitInput(): HTMLInputElement {
  return screen.getByLabelText('max_length') as HTMLInputElement;
}

describe('SamplerCard reply limit', () => {
  it("does not carry one preset's reply limit into another when «Без лимита» is unticked after switching", async () => {
    await renderWithProviders(<SamplerCard data={SETTINGS} />);

    expect(limitInput().value).toBe('3000');

    fireEvent.click(screen.getByRole('button', { name: 'Artemis' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Без лимита' }));

    expect(limitInput().value).toBe('1024');
  });

  it('keeps values off the spinner step, such as a 32257 context or a 0.73 temperature, without the browser blocking the save', async () => {
    await renderWithProviders(<SamplerCard data={SETTINGS} />);
    const temperature = screen.getByLabelText('temperature') as HTMLInputElement;
    const context = screen.getByLabelText('context') as HTMLInputElement;

    fireEvent.change(temperature, { target: { value: '0.73' } });
    fireEvent.change(context, { target: { value: '32257' } });

    expect(temperature.value).toBe('0.73');
    expect(context.value).toBe('32257');
    expect(temperature.closest('form')?.noValidate).toBe(true);
  });
});
