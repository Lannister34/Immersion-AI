import type { ChatGenerationSettingsDto } from '@immersion/contracts/chats';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { getApiErrorMessage } from '../../../shared/api/get-api-error-message';
import { pluralRu } from '../../../shared/lib/plural';
import { ChevronRightIcon } from '../../../shared/ui/icons';
import { useUpdateChatGenerationSettings } from '../mutations/use-update-chat-generation-settings';
import {
  countSamplingOverrides,
  createEmptySamplingDraft,
  type InheritedSampling,
  parseSamplingDraft,
  type SamplingOverrideErrors,
  type SamplingOverrideKey,
  type SamplingOverridesDraft,
  samplingDraftsEqual,
  toSamplingDraft,
} from '../view-models/sampling-overrides';
import { SamplingOverridesFields } from './sampling-overrides-fields';

const INHERIT_PRESET_VALUE = '';

export interface GenerationSettingsSectionProps {
  chatId: string;
  /** Значения, которые backend реально применит без переопределений чата. */
  effectiveSampling?: InheritedSampling | undefined;
  generationSettings: ChatGenerationSettingsDto;
  settings?: SettingsOverviewResponse | undefined;
}

interface GenerationSettingsDraft {
  samplerPresetId: string;
  sampling: SamplingOverridesDraft;
  systemPrompt: string;
}

function toDraft(generationSettings: ChatGenerationSettingsDto): GenerationSettingsDraft {
  return {
    samplerPresetId: generationSettings.samplerPresetId ?? INHERIT_PRESET_VALUE,
    sampling: toSamplingDraft(generationSettings.sampling),
    systemPrompt: generationSettings.systemPrompt ?? '',
  };
}

function draftsEqual(left: GenerationSettingsDraft, right: GenerationSettingsDraft): boolean {
  return (
    left.samplerPresetId === right.samplerPresetId &&
    left.systemPrompt === right.systemPrompt &&
    samplingDraftsEqual(left.sampling, right.sampling)
  );
}

export function GenerationSettingsSection({
  chatId,
  effectiveSampling,
  generationSettings,
  settings,
}: GenerationSettingsSectionProps) {
  const presets = settings?.sampler.presets ?? [];
  const activePresetName =
    presets.find((preset) => preset.id === settings?.sampler.activePresetId)?.name ?? 'активный preset';

  // Черновик сбрасываем только при фактическом изменении серверных значений,
  // чтобы фоновая ревалидация session-запроса не затирала правки пользователя.
  const baseline = toDraft(generationSettings);
  const [draft, setDraft] = useState<GenerationSettingsDraft>(baseline);
  const [appliedBaseline, setAppliedBaseline] = useState(baseline);
  const [errors, setErrors] = useState<SamplingOverrideErrors>({});
  // Раздел свёрнут по умолчанию: в обычной работе хватает пресета и system prompt.
  const [samplingOpen, setSamplingOpen] = useState(false);
  if (!draftsEqual(appliedBaseline, baseline)) {
    setAppliedBaseline(baseline);
    setDraft(baseline);
    setErrors({});
  }

  const mutation = useUpdateChatGenerationSettings(chatId);

  const isDirty = !draftsEqual(draft, baseline);
  const canSave = isDirty && !mutation.isPending;
  const overrideCount = countSamplingOverrides(draft.sampling);

  // Подсказки берём у выбранного пресета, а при наследовании — у backend:
  // там уже учтены привязка модели и активный пресет.
  const selectedPreset = presets.find((preset) => preset.id === draft.samplerPresetId);
  const inheritedSampling: InheritedSampling | undefined = selectedPreset ?? effectiveSampling;

  const handleSamplingChange = (key: SamplingOverrideKey, value: string) => {
    setDraft((current) => ({ ...current, sampling: { ...current.sampling, [key]: value } }));
    setErrors((current) => {
      if (!current[key]) {
        return current;
      }
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const handleSave = () => {
    if (!canSave) return;

    const parsedSampling = parseSamplingDraft(draft.sampling);

    if (!parsedSampling.overrides) {
      setErrors(parsedSampling.errors);
      return;
    }

    setErrors({});
    mutation.mutate({
      samplerPresetId: draft.samplerPresetId === INHERIT_PRESET_VALUE ? null : draft.samplerPresetId,
      sampling: parsedSampling.overrides,
      systemPrompt: draft.systemPrompt.trim().length > 0 ? draft.systemPrompt : null,
    });
  };

  const handleReset = () => {
    setDraft(baseline);
    setErrors({});
    mutation.reset();
  };

  const handleClearOverrides = () => {
    setDraft((current) => ({ ...current, sampling: createEmptySamplingDraft() }));
    setErrors({});
  };

  const errorMessage = mutation.error
    ? getApiErrorMessage(mutation.error, 'Не удалось сохранить настройки чата.')
    : null;

  return (
    <div className="col gap-12">
      <div className="field">
        <label className="between" htmlFor="chat-sampler-preset">
          <span>Sampler preset</span>
          <span className="muted mono" style={{ fontSize: 'var(--fz-2xs)' }}>
            per chat
          </span>
        </label>
        <select
          className="input"
          disabled={mutation.isPending || presets.length === 0}
          id="chat-sampler-preset"
          onChange={(event) => {
            const { value } = event.currentTarget;
            setDraft((current) => ({ ...current, samplerPresetId: value }));
          }}
          value={draft.samplerPresetId}
        >
          <option value={INHERIT_PRESET_VALUE}>{`наследовать активный (${activePresetName})`}</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="between" htmlFor="chat-system-prompt">
          <span>System prompt чата</span>
          <span className="muted mono" style={{ fontSize: 'var(--fz-2xs)' }}>
            per chat
          </span>
        </label>
        <textarea
          className="textarea mono"
          disabled={mutation.isPending}
          id="chat-system-prompt"
          maxLength={20_000}
          onChange={(event) => {
            const { value } = event.currentTarget;
            setDraft((current) => ({ ...current, systemPrompt: value }));
          }}
          placeholder="Пусто — используется общий шаблон из настроек"
          rows={5}
          style={{ fontSize: 'var(--fz-xs)', lineHeight: 1.5, minHeight: 90 }}
          value={draft.systemPrompt}
        />
      </div>
      <div className="col" style={{ gap: 8 }}>
        <button
          aria-expanded={samplingOpen}
          className="row gap-6"
          onClick={() => setSamplingOpen((open) => !open)}
          style={{
            alignItems: 'center',
            background: 'transparent',
            border: 0,
            color: 'inherit',
            cursor: 'pointer',
            font: 'inherit',
            padding: 0,
            textAlign: 'left',
          }}
          type="button"
        >
          <span
            style={{
              display: 'inline-flex',
              transform: samplingOpen ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.15s ease-out',
            }}
          >
            <ChevronRightIcon size={12} />
          </span>
          <span style={{ flex: 1, fontSize: 'var(--fz-xs)' }}>Параметры sampler</span>
          <span className="muted mono" style={{ fontSize: 'var(--fz-2xs)' }}>
            {overrideCount > 0 ? pluralRu(overrideCount, ['поле', 'поля', 'полей']) : 'из пресета'}
          </span>
        </button>
        {samplingOpen ? (
          <>
            <div className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
              Выключенный параметр наследует значение пресета — оно показано в поле.
            </div>
            <SamplingOverridesFields
              disabled={mutation.isPending}
              draft={draft.sampling}
              errors={errors}
              inherited={inheritedSampling}
              onChange={handleSamplingChange}
            />
            {overrideCount > 0 ? (
              <button
                className="btn btn--xs"
                disabled={mutation.isPending}
                onClick={handleClearOverrides}
                style={{ alignSelf: 'flex-start' }}
                type="button"
              >
                Сбросить все переопределения
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      {errorMessage ? (
        <div className="muted" style={{ color: 'var(--danger)', fontSize: 'var(--fz-2xs)' }}>
          {errorMessage}
        </div>
      ) : null}
      <div className="row gap-6" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn--xs" disabled={!isDirty || mutation.isPending} onClick={handleReset} type="button">
          Отменить
        </button>
        <button className="btn btn--xs btn--primary" disabled={!canSave} onClick={handleSave} type="button">
          {mutation.isPending ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
      <Link className="btn btn--xs btn--ghost-bordered" style={{ justifyContent: 'center' }} to="/settings">
        Подробнее в настройках
      </Link>
    </div>
  );
}
