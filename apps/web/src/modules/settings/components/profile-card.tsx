import type { SettingsOverviewResponse, UpdateSettingsProfileCommand } from '@immersion/contracts/settings';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { getApiErrorMessage } from '../../../shared/api/get-api-error-message';
import { useUpdateSettingsProfile } from '../mutations/use-update-settings-profile';
import { PromptTemplateCard } from './prompt-template-card';
import { ToggleRow } from './toggle-row';

export interface ProfileCardProps {
  data: SettingsOverviewResponse;
}

interface ProfileFormState {
  userName: string;
  userPersona: string;
  systemPromptTemplate: string;
  responseLanguage: 'ru' | 'en' | 'none';
  streamingEnabled: boolean;
  thinkingEnabled: boolean;
  actionsItalic: boolean;
  quotesHighlighted: boolean;
}

function profileToFormState(profile: SettingsOverviewResponse['profile']): ProfileFormState {
  return {
    userName: profile.userName,
    userPersona: profile.userPersona,
    systemPromptTemplate: profile.systemPromptTemplate,
    responseLanguage: profile.responseLanguage,
    streamingEnabled: profile.streamingEnabled,
    thinkingEnabled: profile.thinkingEnabled,
    actionsItalic: profile.messageFormatting.actionsItalic,
    quotesHighlighted: profile.messageFormatting.quotesHighlighted,
  };
}

function profileFormsEqual(left: ProfileFormState, right: ProfileFormState): boolean {
  return (
    left.userName === right.userName &&
    left.userPersona === right.userPersona &&
    left.systemPromptTemplate === right.systemPromptTemplate &&
    left.responseLanguage === right.responseLanguage &&
    left.streamingEnabled === right.streamingEnabled &&
    left.thinkingEnabled === right.thinkingEnabled &&
    left.actionsItalic === right.actionsItalic &&
    left.quotesHighlighted === right.quotesHighlighted
  );
}

function profileFormToCommand(form: ProfileFormState): UpdateSettingsProfileCommand {
  return {
    userName: form.userName.trim(),
    userPersona: form.userPersona,
    systemPromptTemplate: form.systemPromptTemplate,
    responseLanguage: form.responseLanguage,
    streamingEnabled: form.streamingEnabled,
    thinkingEnabled: form.thinkingEnabled,
    messageFormatting: {
      actionsItalic: form.actionsItalic,
      quotesHighlighted: form.quotesHighlighted,
    },
  };
}

export function ProfileCard({ data }: ProfileCardProps) {
  const initial = useMemo(
    () => (data.profile.userName.trim() || 'Я').slice(0, 1).toUpperCase(),
    [data.profile.userName],
  );
  const baseline = useMemo(() => profileToFormState(data.profile), [data.profile]);
  const [form, setForm] = useState<ProfileFormState>(baseline);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const appliedBaselineRef = useRef(baseline);

  // Сбрасываем форму на серверное состояние только пока пользователь её не редактировал.
  useEffect(() => {
    const previousBaseline = appliedBaselineRef.current;
    appliedBaselineRef.current = baseline;
    setForm((current) => (profileFormsEqual(current, previousBaseline) ? baseline : current));
  }, [baseline]);

  const mutation = useUpdateSettingsProfile({
    onSuccess: () => {
      setSavedAt(Date.now());
    },
  });

  const isDirty = !profileFormsEqual(form, baseline);
  const canSave = isDirty && form.userName.trim().length > 0 && !mutation.isPending;

  // Значение читаем из события синхронно: внутри отложенного апдейтера
  // event.currentTarget уже null, и чтение .value роняет экран.
  const setField = <K extends keyof ProfileFormState>(field: K, value: ProfileFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    mutation.mutate(profileFormToCommand(form));
  };

  const errorMessage = mutation.error ? getApiErrorMessage(mutation.error, 'Не удалось сохранить настройки.') : null;

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
                onChange={(event) => setField('userName', event.currentTarget.value)}
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
                onChange={(event) => setField('userPersona', event.currentTarget.value)}
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
            <label htmlFor="profile-response-language">Язык ответа модели</label>
            <select
              className="input"
              id="profile-response-language"
              onChange={(event) =>
                setField('responseLanguage', event.currentTarget.value as ProfileFormState['responseLanguage'])
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
          <ToggleRow
            checked={form.actionsItalic}
            hint="текст в *звёздочках* показывается курсивом"
            id="profile-actions-italic"
            label="Действия курсивом"
            onChange={(value) => setForm((current) => ({ ...current, actionsItalic: value }))}
          />
          <ToggleRow
            checked={form.quotesHighlighted}
            hint="реплики в кавычках выделяются цветом"
            id="profile-quotes-highlighted"
            label="Подсветка речи"
            onChange={(value) => setForm((current) => ({ ...current, quotesHighlighted: value }))}
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
