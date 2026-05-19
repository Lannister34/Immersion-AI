import type { SettingsOverviewResponse, UpdateSettingsProfileCommand } from '@immersion/contracts/settings';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, type JSX, useEffect, useMemo, useState } from 'react';

import { Topbar } from '../../app/layout/topbar';
import { ApiError } from '../../shared/api/client';
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
import { useUpdateSettingsProfile } from './mutations/use-update-settings-profile';
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

interface ProfileFormState {
  userName: string;
  userPersona: string;
  systemPromptTemplate: string;
  uiLanguage: 'ru' | 'en';
  responseLanguage: 'ru' | 'en' | 'none';
  streamingEnabled: boolean;
  thinkingEnabled: boolean;
}

function profileToFormState(profile: SettingsOverviewResponse['profile']): ProfileFormState {
  return {
    userName: profile.userName,
    userPersona: profile.userPersona,
    systemPromptTemplate: profile.systemPromptTemplate,
    uiLanguage: profile.uiLanguage,
    responseLanguage: profile.responseLanguage,
    streamingEnabled: profile.streamingEnabled,
    thinkingEnabled: profile.thinkingEnabled,
  };
}

function profileFormToCommand(form: ProfileFormState): UpdateSettingsProfileCommand {
  return {
    userName: form.userName.trim(),
    userPersona: form.userPersona,
    systemPromptTemplate: form.systemPromptTemplate,
    uiLanguage: form.uiLanguage,
    responseLanguage: form.responseLanguage,
    streamingEnabled: form.streamingEnabled,
    thinkingEnabled: form.thinkingEnabled,
  };
}

function ProfileCard({ data }: SettingsDataProps) {
  const initial = useMemo(
    () => (data.profile.userName.trim() || 'Я').slice(0, 1).toUpperCase(),
    [data.profile.userName],
  );
  const baseline = useMemo(() => profileToFormState(data.profile), [data.profile]);
  const [form, setForm] = useState<ProfileFormState>(baseline);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setForm(baseline);
  }, [baseline]);

  const mutation = useUpdateSettingsProfile({
    onSuccess: () => {
      setSavedAt(Date.now());
    },
  });

  const isDirty =
    form.userName !== baseline.userName ||
    form.userPersona !== baseline.userPersona ||
    form.systemPromptTemplate !== baseline.systemPromptTemplate ||
    form.uiLanguage !== baseline.uiLanguage ||
    form.responseLanguage !== baseline.responseLanguage ||
    form.streamingEnabled !== baseline.streamingEnabled ||
    form.thinkingEnabled !== baseline.thinkingEnabled;
  const canSave = isDirty && form.userName.trim().length > 0 && !mutation.isPending;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    mutation.mutate(profileFormToCommand(form));
  };

  const errorMessage =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
        ? 'Не удалось сохранить настройки.'
        : null;

  return (
    <>
      <form className="card" id="profile" onSubmit={onSubmit} style={{ padding: 18, display: 'grid', gap: 14 }}>
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
            <div className="field">
              <label htmlFor="profile-user-name">Имя</label>
              <input
                className="input"
                id="profile-user-name"
                maxLength={120}
                onChange={(event) => setForm((current) => ({ ...current, userName: event.currentTarget.value }))}
                placeholder="Например: Миша"
                value={form.userName}
              />
            </div>
            <div className="field">
              <label htmlFor="profile-user-persona">Описание персоны</label>
              <textarea
                className="textarea"
                id="profile-user-persona"
                maxLength={20_000}
                onChange={(event) => setForm((current) => ({ ...current, userPersona: event.currentTarget.value }))}
                placeholder="Как модель должна представлять пользователя"
                rows={4}
                value={form.userPersona}
              />
            </div>
          </div>
        </div>
        <div className="divider" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label htmlFor="profile-ui-language">Язык интерфейса</label>
            <select
              className="input"
              id="profile-ui-language"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  uiLanguage: event.currentTarget.value as ProfileFormState['uiLanguage'],
                }))
              }
              value={form.uiLanguage}
            >
              <option value="ru">RU</option>
              <option value="en">EN</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="profile-response-language">Язык ответа модели</label>
            <select
              className="input"
              id="profile-response-language"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  responseLanguage: event.currentTarget.value as ProfileFormState['responseLanguage'],
                }))
              }
              value={form.responseLanguage}
            >
              <option value="ru">RU</option>
              <option value="en">EN</option>
              <option value="none">не задавать</option>
            </select>
          </div>
        </div>
        <div className="divider" />
        <div className="col gap-12">
          <ToggleRow
            checked={form.streamingEnabled}
            hint="токены приходят по мере генерации"
            id="profile-streaming"
            label="Стриминг ответа"
            onChange={(value) => setForm((current) => ({ ...current, streamingEnabled: value }))}
          />
          <ToggleRow
            checked={form.thinkingEnabled}
            hint="отдельный блок «размышления» под ответом"
            id="profile-thinking"
            label="Показывать reasoning"
            onChange={(value) => setForm((current) => ({ ...current, thinkingEnabled: value }))}
          />
        </div>
        {errorMessage ? (
          <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', padding: 12 }}>
            {errorMessage}
          </div>
        ) : null}
        <div className="row gap-8" style={{ justifyContent: 'flex-end', alignItems: 'center' }}>
          {savedAt && !isDirty ? (
            <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
              сохранено
            </span>
          ) : null}
          <button
            className="btn"
            disabled={!isDirty || mutation.isPending}
            onClick={() => setForm(baseline)}
            type="button"
          >
            Отменить
          </button>
          <button className="btn btn--primary" disabled={!canSave} type="submit">
            {mutation.isPending ? 'Сохраняем…' : 'Сохранить профиль'}
          </button>
        </div>
      </form>
      <PromptTemplateCard
        disabled={mutation.isPending}
        onChange={(value) => setForm((current) => ({ ...current, systemPromptTemplate: value }))}
        value={form.systemPromptTemplate}
      />
    </>
  );
}

interface PromptTemplateCardProps {
  disabled?: boolean;
  onChange: (value: string) => void;
  value: string;
}

function PromptTemplateCard({ disabled, onChange, value }: PromptTemplateCardProps) {
  const trimmedLength = value.trim().length;
  return (
    <section className="card" id="prompts" style={{ padding: 18, display: 'grid', gap: 14 }}>
      <div className="between">
        <h2 style={{ margin: 0, fontSize: 'var(--fz-xl)', fontWeight: 600 }}>System Prompt</h2>
        <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
          {trimmedLength > 0 ? `${trimmedLength} символов` : 'шаблон не задан'}
        </span>
      </div>
      <textarea
        className="textarea mono"
        disabled={disabled}
        maxLength={20_000}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder="Например: Reply as {{char}} and do not speak for {{user}}."
        rows={10}
        style={{ fontSize: 'var(--fz-xs)', lineHeight: 1.55, minHeight: 220 }}
        value={value}
      />
      <div className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
        Шаблон применяется ко всем чатам, у которых не задан собственный system prompt.
      </div>
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
        <button className="btn btn--ghost-bordered btn--xs" disabled type="button">
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

interface ToggleRowProps {
  checked: boolean;
  hint: string;
  id: string;
  label: string;
  onChange: (value: boolean) => void;
}

function ToggleRow({ checked, hint, id, label, onChange }: ToggleRowProps) {
  return (
    <label className="between" htmlFor={id} style={{ cursor: 'pointer' }}>
      <div>
        <strong>{label}</strong>
        <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
          {hint}
        </div>
      </div>
      <input checked={checked} id={id} onChange={(event) => onChange(event.currentTarget.checked)} type="checkbox" />
    </label>
  );
}
