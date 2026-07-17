import type { ChatGenerationSettingsDto } from '@immersion/contracts/chats';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { getApiErrorMessage } from '../../../shared/api/get-api-error-message';
import { useUpdateChatGenerationSettings } from '../mutations/use-update-chat-generation-settings';

const INHERIT_PRESET_VALUE = '';

export interface GenerationSettingsSectionProps {
  chatId: string;
  generationSettings: ChatGenerationSettingsDto;
  settings?: SettingsOverviewResponse | undefined;
}

interface GenerationSettingsDraft {
  samplerPresetId: string;
  systemPrompt: string;
}

function toDraft(generationSettings: ChatGenerationSettingsDto): GenerationSettingsDraft {
  return {
    samplerPresetId: generationSettings.samplerPresetId ?? INHERIT_PRESET_VALUE,
    systemPrompt: generationSettings.systemPrompt ?? '',
  };
}

export function GenerationSettingsSection({ chatId, generationSettings, settings }: GenerationSettingsSectionProps) {
  const presets = settings?.sampler.presets ?? [];
  const activePresetName =
    presets.find((preset) => preset.id === settings?.sampler.activePresetId)?.name ?? 'активный preset';

  // Черновик сбрасываем только при фактическом изменении серверных значений,
  // чтобы фоновая ревалидация session-запроса не затирала правки пользователя.
  const baseline = toDraft(generationSettings);
  const [draft, setDraft] = useState<GenerationSettingsDraft>(baseline);
  const [appliedBaseline, setAppliedBaseline] = useState(baseline);
  if (
    appliedBaseline.samplerPresetId !== baseline.samplerPresetId ||
    appliedBaseline.systemPrompt !== baseline.systemPrompt
  ) {
    setAppliedBaseline(baseline);
    setDraft(baseline);
  }

  const mutation = useUpdateChatGenerationSettings(chatId);

  const isDirty = draft.samplerPresetId !== baseline.samplerPresetId || draft.systemPrompt !== baseline.systemPrompt;
  const canSave = isDirty && !mutation.isPending;

  const handleSave = () => {
    if (!canSave) return;
    mutation.mutate({
      samplerPresetId: draft.samplerPresetId === INHERIT_PRESET_VALUE ? null : draft.samplerPresetId,
      sampling: generationSettings.sampling,
      systemPrompt: draft.systemPrompt.trim().length > 0 ? draft.systemPrompt : null,
    });
  };

  const handleReset = () => {
    setDraft(baseline);
    mutation.reset();
  };

  const errorMessage = mutation.error
    ? getApiErrorMessage(mutation.error, 'Не удалось сохранить настройки чата.')
    : null;

  const samplingEntries = Object.entries(generationSettings.sampling).filter(([, value]) => value !== null);

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
      {errorMessage ? (
        <div className="muted" style={{ color: 'var(--danger)', fontSize: 'var(--fz-2xs)' }}>
          {errorMessage}
        </div>
      ) : null}
      <div className="row gap-6" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn--xs" disabled={!isDirty || mutation.isPending} onClick={handleReset} type="button">
          Сбросить
        </button>
        <button className="btn btn--xs btn--primary" disabled={!canSave} onClick={handleSave} type="button">
          {mutation.isPending ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
      <div className="col" style={{ gap: 6 }}>
        {samplingEntries.map(([key, value]) => (
          <div className="between" key={key} style={{ fontSize: 'var(--fz-xs)' }}>
            <span style={{ color: 'var(--muted)' }}>{key}</span>
            <span className="mono tnum" style={{ color: 'var(--text)' }}>
              {String(value)}
            </span>
          </div>
        ))}
        {samplingEntries.length === 0 ? (
          <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
            Точечных переопределений sampler нет — действуют значения preset.
          </div>
        ) : null}
      </div>
      <Link className="btn btn--xs btn--ghost-bordered" style={{ justifyContent: 'center' }} to="/settings">
        Подробнее в настройках
      </Link>
    </div>
  );
}
