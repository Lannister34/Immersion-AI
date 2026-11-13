import type { PatchProviderSettingsCommand, ProviderSettingsSnapshot } from '@immersion/contracts/providers';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../test-support/render-with-providers';
import { stubFetch } from '../../../test-support/stub-fetch';
import { ExternalProviderForm } from './external-provider-form';

const SAVED_KEY_PLACEHOLDER = 'ключ сохранён — введите новый, чтобы заменить';

const OPENAI_WITH_SAVED_KEY: ProviderSettingsSnapshot = {
  activeProvider: 'openai',
  mode: 'external',
  providerConfigs: {
    openai: { apiKeyConfigured: true, model: 'gpt-4o', url: 'https://api.openai.com/v1' },
  },
  providerDefinitions: [
    {
      apiKind: 'openai-cloud',
      fields: [
        { key: 'url', required: true, type: 'text', defaultValue: 'https://api.openai.com/v1' },
        { key: 'apiKey', placeholder: 'sk-…', required: true, type: 'password' },
        { key: 'model', placeholder: 'gpt-4o', required: true, type: 'text' },
      ],
      label: 'OpenAI',
      type: 'openai',
    },
  ],
};

const OPENAI_WITHOUT_KEY: ProviderSettingsSnapshot = {
  ...OPENAI_WITH_SAVED_KEY,
  providerConfigs: { openai: { apiKeyConfigured: false, model: 'gpt-4o', url: 'https://api.openai.com/v1' } },
};

async function renderForm(snapshot: ProviderSettingsSnapshot) {
  const onSave = vi.fn<(command: PatchProviderSettingsCommand) => Promise<unknown>>().mockResolvedValue(undefined);
  await renderWithProviders(<ExternalProviderForm isSaving={false} onSave={onSave} snapshot={snapshot} />);

  return { keyInput: screen.getByLabelText<HTMLInputElement>('API-ключ'), onSave };
}

function changeModel(value: string) {
  fireEvent.change(screen.getByLabelText('Модель'), { target: { value } });
}

describe('ExternalProviderForm', () => {
  it('shows a saved key as saved and leaves the input empty', async () => {
    const { keyInput } = await renderForm(OPENAI_WITH_SAVED_KEY);

    expect(keyInput.value).toBe('');
    expect(keyInput.placeholder).toBe(SAVED_KEY_PLACEHOLDER);
    expect(screen.getByRole('button', { name: 'Удалить ключ' })).toBeDefined();
  });

  it('offers no removal when no key is saved', async () => {
    const { keyInput } = await renderForm(OPENAI_WITHOUT_KEY);

    expect(keyInput.placeholder).toBe('sk-…');
    expect(screen.queryByRole('button', { name: 'Удалить ключ' })).toBeNull();
  });

  it('saves other fields without sending the key, so the saved key stays', async () => {
    const { onSave } = await renderForm(OPENAI_WITH_SAVED_KEY);

    changeModel('gpt-4o-mini');
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      activeProvider: 'openai',
      config: { model: 'gpt-4o-mini', url: 'https://api.openai.com/v1' },
    });
  });

  it('replaces the saved key with a typed one', async () => {
    const { keyInput, onSave } = await renderForm(OPENAI_WITH_SAVED_KEY);

    fireEvent.change(keyInput, { target: { value: '  sk-replacement  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0].config?.apiKey).toBe('sk-replacement');
  });

  it('sends an empty key when removal was requested, and the removal can be undone before saving', async () => {
    const { keyInput, onSave } = await renderForm(OPENAI_WITH_SAVED_KEY);

    fireEvent.click(screen.getByRole('button', { name: 'Удалить ключ' }));
    expect(keyInput.disabled).toBe(true);
    expect(keyInput.placeholder).toBe('ключ будет удалён при сохранении');

    fireEvent.click(screen.getByRole('button', { name: 'Не удалять' }));
    expect(keyInput.placeholder).toBe(SAVED_KEY_PLACEHOLDER);
    expect((screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Удалить ключ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0].config?.apiKey).toBe('');
  });

  it('refuses a typed key with a space inside before sending anything', async () => {
    const fetchStub = stubFetch();
    const { keyInput, onSave } = await renderForm(OPENAI_WITH_SAVED_KEY);

    fireEvent.change(keyInput, { target: { value: 'sk-two words' } });
    fireEvent.click(screen.getByRole('button', { name: 'Список моделей' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(
      await screen.findByText(
        'API-ключ может содержать только видимые латинские символы, цифры и знаки, без пробелов.',
      ),
    ).toBeDefined();
    expect(onSave).not.toHaveBeenCalled();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('forgets the typed key once it is saved', async () => {
    const { keyInput, onSave } = await renderForm(OPENAI_WITHOUT_KEY);

    fireEvent.change(keyInput, { target: { value: 'sk-first' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(keyInput.value).toBe(''));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('leaves the removal state once the removal is saved', async () => {
    const { keyInput } = await renderForm(OPENAI_WITH_SAVED_KEY);

    fireEvent.click(screen.getByRole('button', { name: 'Удалить ключ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(keyInput.disabled).toBe(false));
  });

  it('asks for the model list without a key, so the server uses the saved one', async () => {
    const fetchStub = stubFetch().mockResolvedValue(
      Response.json({
        activeProvider: 'openai',
        endpoint: 'https://api.openai.com/v1/models',
        issue: null,
        mode: 'external',
        models: [{ id: 'gpt-4o' }],
        status: 'ok',
      }),
    );
    await renderForm(OPENAI_WITH_SAVED_KEY);

    fireEvent.click(screen.getByRole('button', { name: 'Список моделей' }));

    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchStub.mock.calls[0]?.[1]?.body))).toEqual({
      provider: 'openai',
      url: 'https://api.openai.com/v1',
    });
  });
});
