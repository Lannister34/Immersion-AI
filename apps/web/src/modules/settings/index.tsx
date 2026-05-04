import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';

import { Topbar } from '../../app/layout/topbar';
import {
  BoltIcon,
  CheckIcon,
  CodeIcon,
  CommandIcon,
  CpuIcon,
  FolderIcon,
  type IconProps,
  LayersIcon,
  PlusIcon,
  SlidersIcon,
  UserIcon,
} from '../../shared/ui/icons';
import { settingsOverviewQueryOptions } from './queries/settings-overview-query';

export { getSettingsOverview } from './api/get-settings-overview';
export { settingsOverviewQueryKey, settingsOverviewQueryOptions } from './queries/settings-overview-query';

interface SettingsSection {
  id: string;
  label: string;
  icon: (props: IconProps) => JSX.Element;
}

const SECTIONS: SettingsSection[] = [
  { id: 'profile', label: 'Профиль / Persona', icon: UserIcon },
  { id: 'prompts', label: 'System Prompt', icon: CodeIcon },
  { id: 'sampler', label: 'Sampler Presets', icon: SlidersIcon },
  { id: 'models', label: 'Model Bindings', icon: CpuIcon },
  { id: 'gen', label: 'Generation Defaults', icon: BoltIcon },
  { id: 'ui', label: 'Интерфейс', icon: LayersIcon },
  { id: 'hotkeys', label: 'Hotkeys', icon: CommandIcon },
  { id: 'backup', label: 'Backups · данные', icon: FolderIcon },
];

export function SettingsScreen() {
  const settingsQuery = useQuery(settingsOverviewQueryOptions());
  const data = settingsQuery.data;

  return (
    <main className="main">
      <Topbar
        actions={
          settingsQuery.isFetching ? null : (
            <span className="pill pill--ok">
              <CheckIcon size={11} /> сохранено
            </span>
          )
        }
        crumbs={[{ label: 'Настройки', strong: true }]}
        search={false}
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">Настройки</h1>
              <div className="page__sub">Профиль · prompt · sampler · runtime · UI</div>
            </div>
          </div>
        </div>
        <div className="page__body" style={{ display: 'grid', gridTemplateColumns: '220px minmax(0,1fr)', gap: 24 }}>
          <nav className="col gap-2" style={{ alignSelf: 'start', position: 'sticky', top: 0 }}>
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <a
                  className="sb__link"
                  href={`#${section.id}`}
                  key={section.id}
                  aria-current={section.id === 'profile' ? 'page' : undefined}
                >
                  <span className="sb__icon">
                    <Icon size={14} />
                  </span>
                  <span>{section.label}</span>
                  <span />
                </a>
              );
            })}
          </nav>
          <div className="col gap-16">
            {settingsQuery.isLoading ? (
              <div className="card" style={{ padding: 18 }}>
                <div className="muted">Загружаем профиль…</div>
              </div>
            ) : settingsQuery.isError || !data ? (
              <div className="card" style={{ padding: 18 }}>
                <div className="muted">Не удалось получить настройки. Проверьте rewrite API.</div>
              </div>
            ) : (
              <>
                <ProfileCard data={data} />
                <PromptTemplateCard prompt={data.profile.systemPromptTemplate} />
                <SamplerCard data={data} />
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

interface SettingsDataProps {
  data: SettingsOverviewResponse;
}

function ProfileCard({ data }: SettingsDataProps) {
  const { profile } = data;
  const initial = (profile.userName.trim() || 'Я').slice(0, 1).toUpperCase();

  return (
    <section className="card" id="profile" style={{ padding: 18, display: 'grid', gap: 14 }}>
      <div className="between">
        <h2 style={{ margin: 0, fontSize: 'var(--fz-xl)', fontWeight: 600 }}>Профиль / Persona</h2>
        <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
          как вы представляете себя в чатах
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 18, alignItems: 'start' }}>
        <div
          className="avatar avatar--96"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--hairline)' }}
        >
          {initial}
        </div>
        <div className="col">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label>Имя</label>
              <input className="input" defaultValue={profile.userName} readOnly />
            </div>
            <div className="field">
              <label>Отображаемое имя</label>
              <input className="input" defaultValue={profile.userName} readOnly />
            </div>
          </div>
          <div className="field">
            <label>Описание персоны</label>
            <textarea className="textarea" defaultValue={profile.userPersona} readOnly />
          </div>
        </div>
      </div>
      <div className="divider" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label>Язык интерфейса</label>
          <input className="input" defaultValue={profile.uiLanguage.toUpperCase()} readOnly />
        </div>
        <div className="field">
          <label>Язык ответа модели</label>
          <input className="input" defaultValue={profile.responseLanguage.toUpperCase()} readOnly />
        </div>
      </div>
      <div className="divider" />
      <div className="col gap-12">
        <ToggleRow hint="токены приходят по мере генерации" label="Стриминг ответа" value={profile.streamingEnabled} />
        <ToggleRow
          hint="отдельный блок «размышления» под ответом"
          label="Показывать reasoning"
          value={profile.thinkingEnabled}
        />
      </div>
    </section>
  );
}

function PromptTemplateCard({ prompt }: { prompt: string }) {
  const trimmed = prompt.trim();
  return (
    <section className="card" id="prompts" style={{ padding: 18, display: 'grid', gap: 14 }}>
      <div className="between">
        <h2 style={{ margin: 0, fontSize: 'var(--fz-xl)', fontWeight: 600 }}>System Prompt</h2>
        <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
          {trimmed ? `${trimmed.length} символов` : 'шаблон не задан'}
        </span>
      </div>
      <pre
        className="mono"
        style={{
          margin: 0,
          padding: 14,
          background: 'var(--bg-2)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--r-sm)',
          color: 'var(--text-1)',
          fontSize: 'var(--fz-xs)',
          lineHeight: 1.55,
          maxHeight: 320,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
        }}
      >
        {trimmed || 'Шаблон ещё не задан.'}
      </pre>
    </section>
  );
}

function SamplerCard({ data }: SettingsDataProps) {
  const { sampler } = data;
  const activePreset = sampler.presets.find((preset) => preset.id === sampler.activePresetId);
  const stats: [string, string][] = activePreset
    ? [
        ['temperature', activePreset.temperature.toFixed(2)],
        ['top_p', activePreset.topP.toFixed(2)],
        ['top_k', String(activePreset.topK)],
        ['min_p', activePreset.minP.toFixed(2)],
        ['rep_pen', activePreset.repeatPenalty.toFixed(2)],
        ['rep_pen_range', String(activePreset.repeatPenaltyRange)],
        ['max_length', String(activePreset.maxTokens)],
        ['context', String(activePreset.maxContextLength)],
      ]
    : [];

  return (
    <section className="card" id="sampler" style={{ padding: 18, display: 'grid', gap: 14 }}>
      <div className="between">
        <h2 style={{ margin: 0, fontSize: 'var(--fz-xl)', fontWeight: 600 }}>Sampler Presets</h2>
        <button className="btn btn--ghost-bordered btn--xs" type="button">
          <PlusIcon size={11} /> Новый preset
        </button>
      </div>
      <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
        {sampler.presets.map((preset) => (
          <span className={preset.id === sampler.activePresetId ? 'pill pill--accent' : 'pill'} key={preset.id}>
            {preset.id === sampler.activePresetId ? <CheckIcon size={10} /> : null}
            {preset.name}
          </span>
        ))}
      </div>
      {stats.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {stats.map(([k, v]) => (
            <div className="card" key={k} style={{ padding: '8px 10px', background: 'var(--bg-2)' }}>
              <div
                className="muted"
                style={{ fontSize: 'var(--fz-2xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                {k}
              </div>
              <div className="mono tnum" style={{ fontSize: 'var(--fz-md)', fontWeight: 600 }}>
                {v}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 'var(--fz-sm)' }}>
          Параметры активного preset недоступны.
        </div>
      )}
      <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
        Привязок к моделям: <span className="mono tnum">{sampler.modelBindingCount}</span>
      </div>
    </section>
  );
}

function ToggleRow({ hint, label, value }: { hint: string; label: string; value: boolean }) {
  return (
    <div className="between">
      <div>
        <strong>{label}</strong>
        <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
          {hint}
        </div>
      </div>
      <span className="toggle" data-on={value ? 'true' : 'false'} />
    </div>
  );
}
