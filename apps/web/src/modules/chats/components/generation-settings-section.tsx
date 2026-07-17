import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { Link } from '@tanstack/react-router';

export interface GenerationSettingsSectionProps {
  samplerPresetId: string | null;
  sampling: Record<string, number | string | null>;
  settings?: SettingsOverviewResponse | undefined;
}

export function GenerationSettingsSection({ samplerPresetId, sampling, settings }: GenerationSettingsSectionProps) {
  const presets = settings?.sampler.presets ?? [];
  const activeName =
    presets.find((preset) => preset.id === samplerPresetId)?.name ??
    presets.find((preset) => preset.id === settings?.sampler.activePresetId)?.name ??
    'preset не выбран';
  return (
    <div className="col gap-12">
      <div className="field">
        <label className="between">
          <span>Sampler preset</span>
          <span className="muted mono" style={{ fontSize: 'var(--fz-2xs)' }}>
            per chat
          </span>
        </label>
        <div
          className="card"
          style={{
            padding: '8px 10px',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 'var(--fz-sm)',
          }}
        >
          {activeName}
        </div>
      </div>
      <div className="col" style={{ gap: 6 }}>
        {Object.entries(sampling)
          .filter(([, value]) => value !== null)
          .slice(0, 8)
          .map(([key, value]) => (
            <div className="between" key={key} style={{ fontSize: 'var(--fz-xs)' }}>
              <span style={{ color: 'var(--muted)' }}>{key}</span>
              <span className="mono tnum" style={{ color: 'var(--text)' }}>
                {String(value)}
              </span>
            </div>
          ))}
        {Object.values(sampling).every((value) => value === null) ? (
          <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
            Используются значения активного preset.
          </div>
        ) : null}
      </div>
      <Link className="btn btn--xs btn--ghost-bordered" style={{ justifyContent: 'center' }} to="/settings">
        Подробнее в настройках
      </Link>
    </div>
  );
}
