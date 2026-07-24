import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { Link } from '@tanstack/react-router';

import type { AutoSavedGenerationSettings } from '../mutations/use-auto-saved-generation-settings';
import { INHERIT_PRESET_VALUE } from '../mutations/use-auto-saved-generation-settings';
import { SaveErrorLine } from './save-error-line';

export interface GenerationSettingsSectionProps {
  form: AutoSavedGenerationSettings;
  settings?: SettingsOverviewResponse | undefined;
}

export function GenerationSettingsSection({ form, settings }: GenerationSettingsSectionProps) {
  const presets = settings?.sampler.presets ?? [];
  const activePresetName =
    presets.find((preset) => preset.id === settings?.sampler.activePresetId)?.name ?? 'активный preset';

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
          disabled={presets.length === 0}
          id="chat-sampler-preset"
          onChange={(event) => {
            const { value } = event.currentTarget;
            form.setSamplerPresetId(value);
          }}
          value={form.draft.samplerPresetId}
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
          id="chat-system-prompt"
          maxLength={20_000}
          onChange={(event) => {
            const { value } = event.currentTarget;
            form.setSystemPrompt(value);
          }}
          placeholder="Пусто — используется общий шаблон из настроек"
          rows={5}
          style={{ fontSize: 'var(--fz-xs)', lineHeight: 1.5, minHeight: 90 }}
          value={form.draft.systemPrompt}
        />
      </div>
      <SaveErrorLine saveError={form.saveError} />
      <Link className="btn btn--xs btn--ghost-bordered" style={{ justifyContent: 'center' }} to="/settings">
        Подробнее в настройках
      </Link>
    </div>
  );
}
