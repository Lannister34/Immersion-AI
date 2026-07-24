import { useState } from 'react';

import { getApiErrorMessage } from '../../../shared/api/get-api-error-message';
import { SaveIcon } from '../../../shared/ui/icons';
import { useCreateSamplerPreset } from '../../settings';
import type { AutoSavedGenerationSettings } from '../mutations/use-auto-saved-generation-settings';
import { type InheritedSampling, parseSamplingDraft } from '../view-models/sampling-overrides';

export interface SaveAsPresetFormProps {
  /** Название набора, на котором сейчас основан чат: из него собираем имя по умолчанию. */
  baselinePresetName: string;
  effectiveSampling: InheritedSampling | undefined;
  form: AutoSavedGenerationSettings;
}

export function SaveAsPresetForm({ baselinePresetName, effectiveSampling, form }: SaveAsPresetFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const createPreset = useCreateSamplerPreset({
    onSuccess: (response) => {
      // Значения теперь живут в наборе — чат снова просто ссылается на него.
      form.adoptSamplerPreset(response.preset.id);
      setSavedName(response.preset.name);
      setIsOpen(false);
    },
  });

  const open = () => {
    setName(`${baselinePresetName} — свой`);
    setSavedName(null);
    setIsOpen(true);
  };

  const submit = () => {
    const trimmedName = name.trim();
    const parsed = parseSamplingDraft(form.draft.sampling);

    if (trimmedName.length === 0 || !effectiveSampling || !parsed.overrides || createPreset.isPending) {
      return;
    }

    // Черновик может быть ещё не сохранён, поэтому свои значения кладём поверх
    // тех, что backend посчитал действующими.
    createPreset.mutate({
      contextTrimStrategy: parsed.overrides.contextTrimStrategy ?? effectiveSampling.contextTrimStrategy,
      maxContextLength: parsed.overrides.maxContextLength ?? effectiveSampling.maxContextLength,
      maxTokens: parsed.overrides.maxTokens ?? effectiveSampling.maxTokens,
      minP: parsed.overrides.minP ?? effectiveSampling.minP,
      name: trimmedName,
      presencePenalty: parsed.overrides.presencePenalty ?? effectiveSampling.presencePenalty,
      repeatPenalty: parsed.overrides.repeatPenalty ?? effectiveSampling.repeatPenalty,
      repeatPenaltyRange: parsed.overrides.repeatPenaltyRange ?? effectiveSampling.repeatPenaltyRange,
      temperature: parsed.overrides.temperature ?? effectiveSampling.temperature,
      topK: parsed.overrides.topK ?? effectiveSampling.topK,
      topP: parsed.overrides.topP ?? effectiveSampling.topP,
    });
  };

  if (savedName) {
    return (
      <div
        style={{
          background: 'var(--ok-soft)',
          borderRadius: 8,
          color: 'var(--ok)',
          fontSize: 'var(--fz-xs)',
          padding: '8px 10px',
        }}
      >
        Предустановка сохранена — чат снова наследует значения
      </div>
    );
  }

  if (!isOpen) {
    return (
      <button
        className="btn btn--xs btn--ghost-bordered"
        disabled={!effectiveSampling}
        onClick={open}
        style={{ justifyContent: 'center' }}
        type="button"
      >
        <SaveIcon size={13} /> Сохранить изменения как предустановку
      </button>
    );
  }

  return (
    <div
      className="col gap-8"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--hairline-strong)',
        borderRadius: 8,
        padding: 10,
      }}
    >
      <label className="col gap-4" htmlFor="chat-new-preset-name">
        <span style={{ color: 'var(--muted)', fontSize: 'var(--fz-xs)' }}>Название новой предустановки</span>
        <input
          autoFocus
          className="input"
          id="chat-new-preset-name"
          maxLength={120}
          onChange={(event) => {
            const { value } = event.currentTarget;
            setName(value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
          value={name}
        />
      </label>
      <p className="muted" style={{ fontSize: 'var(--fz-2xs)', lineHeight: 1.5, margin: 0 }}>
        Сохранит текущие значения как отдельную предустановку в настройках. Изменения чата станут её частью — сам чат
        вернётся к «из предустановки».
      </p>
      {createPreset.error ? (
        <div style={{ color: 'var(--danger)', fontSize: 'var(--fz-2xs)' }}>
          {getApiErrorMessage(createPreset.error, 'Не удалось сохранить предустановку.')}
        </div>
      ) : null}
      <div className="row gap-6">
        <button className="btn btn--xs btn--ghost-bordered" onClick={() => setIsOpen(false)} type="button">
          Отменить
        </button>
        <button
          className="btn btn--xs btn--primary"
          disabled={name.trim().length === 0 || createPreset.isPending}
          onClick={submit}
          type="button"
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}
