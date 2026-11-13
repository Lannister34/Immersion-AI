import {
  type PatchProviderSettingsCommand,
  ProviderApiKeyInputSchema,
  type ProviderSettingsSnapshot,
  type ProviderType,
  ProviderTypeSchema,
} from '@immersion/contracts/providers';
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { pluralRu } from '../../../shared/lib/plural';
import { ErrorBanner } from '../../../shared/ui/error-banner';
import { probeProviderModels } from '../api/probe-provider-models';
import {
  configToFormState,
  formsEqual,
  type ProviderFormState,
  toProviderKeyChange,
  toProviderSettingsPatch,
} from '../forms/provider-form-state';

interface ExternalProviderFormProps {
  isSaving: boolean;
  onSave: (command: PatchProviderSettingsCommand) => Promise<unknown>;
  snapshot: ProviderSettingsSnapshot | undefined;
}

function findApiKeyProblem(newApiKey: string): string | null {
  const parsed = ProviderApiKeyInputSchema.safeParse(newApiKey);

  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'API-ключ задан неверно.');
}

function describeApiKeyPlaceholder(clearRequested: boolean, keySaved: boolean, fieldPlaceholder?: string): string {
  if (clearRequested) return 'ключ будет удалён при сохранении';
  if (keySaved) return 'ключ сохранён — введите новый, чтобы заменить';
  return fieldPlaceholder ?? 'опционально';
}

export function ExternalProviderForm({ isSaving, onSave, snapshot }: ExternalProviderFormProps) {
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>(snapshot?.activeProvider ?? 'custom');
  const definition = snapshot?.providerDefinitions.find((entry) => entry.type === selectedProvider);
  const baseline = useMemo(
    () => configToFormState(snapshot?.providerConfigs[selectedProvider], definition),
    [definition, selectedProvider, snapshot?.providerConfigs],
  );
  const [form, setForm] = useState<ProviderFormState>(baseline);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const modelsMutation = useMutation({
    mutationFn: probeProviderModels,
    onSuccess: (response) => {
      if (response.status === 'error') {
        setErrorMessage(response.issue?.message ?? 'Не удалось получить список моделей.');
      }
    },
  });
  const availableModels = modelsMutation.data?.status === 'ok' ? modelsMutation.data.models : [];
  const appliedBaselineRef = useRef(baseline);
  const appliedProviderRef = useRef(selectedProvider);

  useEffect(() => {
    const previousBaseline = appliedBaselineRef.current;
    const providerChanged = appliedProviderRef.current !== selectedProvider;
    appliedBaselineRef.current = baseline;
    appliedProviderRef.current = selectedProvider;
    setForm((current) => (providerChanged || formsEqual(current, previousBaseline) ? baseline : current));
    setSavedAt(null);
    setErrorMessage(null);
  }, [baseline, selectedProvider]);

  const selectProvider = (provider: ProviderType) => {
    if (provider !== selectedProvider) {
      modelsMutation.reset();
    }
    setSelectedProvider(provider);
  };

  if (!snapshot) {
    return (
      <div className="empty" style={{ padding: 60 }}>
        <p>Загрузка настроек провайдера…</p>
      </div>
    );
  }

  const isDirty = !formsEqual(form, baseline) || selectedProvider !== snapshot.activeProvider;
  const canSave = isDirty && form.url.trim().length > 0 && !isSaving;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    const apiKeyProblem = findApiKeyProblem(form.newApiKey);
    if (apiKeyProblem) {
      setErrorMessage(apiKeyProblem);
      return;
    }
    setErrorMessage(null);
    try {
      await onSave(toProviderSettingsPatch(selectedProvider, form));
      setForm((current) => ({ ...current, clearApiKey: false, newApiKey: '' }));
      setSavedAt(Date.now());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось сохранить настройки внешнего API.');
    }
  };

  const apiKeyField = definition?.fields.find((field) => field.key === 'apiKey');
  const apiKeySaved = snapshot.providerConfigs[selectedProvider]?.apiKeyConfigured === true;
  const apiKeyPlaceholder = describeApiKeyPlaceholder(form.clearApiKey, apiKeySaved, apiKeyField?.placeholder);
  const modelField = definition?.fields.find((field) => field.key === 'model');

  return (
    <section className="card" style={{ padding: 18, display: 'grid', gap: 14 }}>
      <div className="between">
        <h2 style={{ margin: 0, fontSize: 'var(--fz-xl)', fontWeight: 600 }}>Внешний API</h2>
        <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
          {selectedProvider === snapshot.activeProvider ? 'активный провайдер' : 'переключим на этого при сохранении'}
        </span>
      </div>
      <form className="col gap-12" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="provider-type">Провайдер</label>
          <select
            className="input"
            id="provider-type"
            onChange={(event) => selectProvider(ProviderTypeSchema.parse(event.currentTarget.value))}
            value={selectedProvider}
          >
            {snapshot.providerDefinitions.map((entry) => (
              <option key={entry.type} value={entry.type}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="provider-url">Base URL</label>
          <input
            className="input"
            id="provider-url"
            onChange={(event) => {
              const { value } = event.currentTarget;
              setForm((current) => ({ ...current, url: value }));
            }}
            placeholder="http://127.0.0.1:5001"
            type="url"
            value={form.url}
          />
        </div>
        {apiKeyField ? (
          <div className="field">
            <label htmlFor="provider-api-key">API-ключ</label>
            <div className="row gap-8">
              <input
                autoComplete="off"
                className="input"
                disabled={form.clearApiKey}
                id="provider-api-key"
                onChange={(event) => {
                  const { value } = event.currentTarget;
                  setForm((current) => ({ ...current, newApiKey: value }));
                }}
                placeholder={apiKeyPlaceholder}
                style={{ flex: 1 }}
                type="password"
                value={form.newApiKey}
              />
              {apiKeySaved ? (
                <button
                  className="btn btn--ghost-bordered"
                  onClick={() =>
                    setForm((current) => ({ ...current, clearApiKey: !current.clearApiKey, newApiKey: '' }))
                  }
                  type="button"
                >
                  {form.clearApiKey ? 'Не удалять' : 'Удалить ключ'}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {modelField ? (
          <div className="field">
            <label htmlFor="provider-model">Модель</label>
            <div className="row gap-8">
              <input
                className="input"
                id="provider-model"
                list="provider-models"
                onChange={(event) => {
                  const { value } = event.currentTarget;
                  setForm((current) => ({ ...current, model: value }));
                }}
                placeholder={modelField.placeholder ?? 'опционально'}
                style={{ flex: 1 }}
                value={form.model}
              />
              <button
                className="btn btn--ghost-bordered"
                disabled={form.url.trim().length === 0 || modelsMutation.isPending}
                onClick={() => {
                  const apiKeyProblem = findApiKeyProblem(form.newApiKey);
                  if (apiKeyProblem) {
                    setErrorMessage(apiKeyProblem);
                    return;
                  }
                  setErrorMessage(null);
                  modelsMutation.mutate({
                    provider: selectedProvider,
                    url: form.url.trim(),
                    ...toProviderKeyChange(form),
                  });
                }}
                type="button"
              >
                {modelsMutation.isPending ? 'Запрашиваем…' : 'Список моделей'}
              </button>
            </div>
            <datalist id="provider-models">
              {availableModels.map((model) => (
                <option key={model.id} value={model.id} />
              ))}
            </datalist>
            {availableModels.length > 0 ? (
              <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
                Провайдер вернул {pluralRu(availableModels.length, ['модель', 'модели', 'моделей'])} — они
                подсказываются в поле.
              </span>
            ) : null}
          </div>
        ) : null}
        {errorMessage ? <ErrorBanner>{errorMessage}</ErrorBanner> : null}
        <div className="row gap-8" style={{ justifyContent: 'flex-end', alignItems: 'center' }}>
          {savedAt && !isDirty ? (
            <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
              Настройки внешнего API сохранены.
            </span>
          ) : null}
          <button
            className="btn"
            disabled={!isDirty || isSaving}
            onClick={() => {
              setForm(baseline);
              selectProvider(snapshot.activeProvider);
            }}
            type="button"
          >
            Отменить
          </button>
          <button className="btn btn--primary" disabled={!canSave} type="submit">
            {isSaving ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </section>
  );
}
