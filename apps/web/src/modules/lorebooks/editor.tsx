import type { LorebookDetailDto, LorebookEntryDto, SaveLorebookCommand } from '@immersion/contracts/lorebooks';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';

import { Topbar } from '../../app/layout/topbar';
import { ApiError } from '../../shared/api/client';
import { PlusIcon, TrashIcon } from '../../shared/ui/icons';
import { deleteLorebook } from './api/delete-lorebook';
import { createLorebook, updateLorebook } from './api/save-lorebook';
import { lorebookDetailQueryKey, lorebookDetailQueryOptions } from './queries/lorebook-detail-query';
import { lorebookListQueryKey } from './queries/lorebook-list-query';

interface LorebookEditorScreenProps {
  lorebookId: string | null;
}

interface EditorEntry {
  content: string;
  enabled: boolean;
  keysText: string;
  priority: number;
}

interface LorebookFormState {
  entries: EditorEntry[];
  name: string;
  tagsText: string;
}

function entryToEditor(entry: LorebookEntryDto): EditorEntry {
  return {
    content: entry.content,
    enabled: entry.enabled,
    keysText: entry.keys.join(', '),
    priority: entry.priority,
  };
}

function toFormState(detail: LorebookDetailDto | null): LorebookFormState {
  if (!detail) {
    return { entries: [], name: '', tagsText: '' };
  }
  return {
    entries: detail.entries.map(entryToEditor),
    name: detail.name,
    tagsText: detail.tags.join(', '),
  };
}

function editorToEntry(entry: EditorEntry): LorebookEntryDto {
  return {
    content: entry.content,
    enabled: entry.enabled,
    keys: entry.keysText
      .split(',')
      .map((key) => key.trim())
      .filter((key) => key.length > 0),
    priority: Number.isFinite(entry.priority) ? Math.trunc(entry.priority) : 0,
  };
}

function toCommand(state: LorebookFormState): SaveLorebookCommand {
  return {
    entries: state.entries.map(editorToEntry),
    name: state.name.trim(),
    tags: state.tagsText
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
  };
}

function formatRelative(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function emptyEntry(): EditorEntry {
  return { content: '', enabled: true, keysText: '', priority: 0 };
}

export function LorebookEditorScreen({ lorebookId }: LorebookEditorScreenProps) {
  const isNew = lorebookId === null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({
    ...lorebookDetailQueryOptions(lorebookId ?? ''),
    enabled: !isNew,
  });
  const detail = isNew ? null : (detailQuery.data?.lorebook ?? null);

  const initialState = useMemo(() => toFormState(detail), [detail]);
  const [form, setForm] = useState<LorebookFormState>(initialState);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setForm(initialState);
  }, [initialState]);

  const isDirty = useMemo(() => {
    if (form.name !== initialState.name || form.tagsText !== initialState.tagsText) return true;
    if (form.entries.length !== initialState.entries.length) return true;
    return form.entries.some((entry, index) => {
      const base = initialState.entries[index];
      if (!base) return true;
      return (
        entry.content !== base.content ||
        entry.enabled !== base.enabled ||
        entry.keysText !== base.keysText ||
        entry.priority !== base.priority
      );
    });
  }, [form, initialState]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const command = toCommand(form);
      if (isNew) {
        return createLorebook(command);
      }
      return updateLorebook(lorebookId, command);
    },
    onSuccess: async (response) => {
      queryClient.setQueryData(lorebookDetailQueryKey(response.lorebook.id), response);
      await queryClient.invalidateQueries({ queryKey: lorebookListQueryKey });
      if (isNew) {
        await navigate({ to: '/lorebooks/$lorebookId', params: { lorebookId: response.lorebook.id } });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (isNew) return;
      await deleteLorebook(lorebookId);
    },
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: lorebookDetailQueryKey(lorebookId ?? '') });
      await queryClient.invalidateQueries({ queryKey: lorebookListQueryKey });
      await navigate({ to: '/lorebooks' });
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = form.name.trim();
    if (!trimmed) return;
    saveMutation.mutate();
  };

  const addEntry = () => {
    setForm((current) => ({ ...current, entries: [...current.entries, emptyEntry()] }));
  };

  const updateEntry = (index: number, patch: Partial<EditorEntry>) => {
    setForm((current) => ({
      ...current,
      entries: current.entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    }));
  };

  const removeEntry = (index: number) => {
    setForm((current) => ({
      ...current,
      entries: current.entries.filter((_, i) => i !== index),
    }));
  };

  const errorMessage =
    saveMutation.error instanceof ApiError
      ? saveMutation.error.message
      : saveMutation.error
        ? 'Не удалось сохранить лорбук.'
        : null;
  const deleteError =
    deleteMutation.error instanceof ApiError
      ? deleteMutation.error.message
      : deleteMutation.error
        ? 'Не удалось удалить лорбук.'
        : null;

  return (
    <main className="main">
      <Topbar
        actions={
          <>
            <button
              className="btn"
              disabled={saveMutation.isPending || deleteMutation.isPending || !isDirty}
              onClick={() => setForm(initialState)}
              type="button"
            >
              Отменить
            </button>
            {!isNew && confirmDelete ? (
              <>
                <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
                  удалить лорбук?
                </span>
                <button
                  className="btn btn--danger"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate()}
                  type="button"
                >
                  Да, удалить
                </button>
                <button
                  className="btn btn--icon"
                  disabled={deleteMutation.isPending}
                  onClick={() => setConfirmDelete(false)}
                  title="Не удалять"
                  type="button"
                >
                  ✕
                </button>
              </>
            ) : !isNew ? (
              <button
                className="btn"
                disabled={saveMutation.isPending || deleteMutation.isPending}
                onClick={() => setConfirmDelete(true)}
                title="Удалить файл лорбука"
                type="button"
              >
                <TrashIcon size={14} /> Удалить
              </button>
            ) : null}
            <button
              className="btn btn--primary"
              disabled={saveMutation.isPending || deleteMutation.isPending || !isDirty || form.name.trim().length === 0}
              form="lorebook-editor-form"
              type="submit"
            >
              {saveMutation.isPending ? 'Сохраняем…' : isNew ? 'Создать' : 'Сохранить'}
            </button>
          </>
        }
        crumbs={[
          { label: 'Лорбуки' },
          { label: isNew ? 'Новый лорбук' : (detail?.name ?? lorebookId ?? 'Лорбук'), strong: true },
        ]}
        search={false}
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">{isNew ? 'Новый лорбук' : (detail?.name ?? 'Загрузка…')}</h1>
              <div className="page__sub">
                {isNew
                  ? 'Создаём файл в data/worlds/'
                  : detailQuery.isLoading
                    ? 'Загружаем…'
                    : detail
                      ? `${detail.entries.length} запис${detail.entries.length === 1 ? 'ь' : detail.entries.length >= 2 && detail.entries.length <= 4 ? 'и' : 'ей'} · сохранён ${formatRelative(detail.updatedAt)}`
                      : 'Не удалось загрузить лорбук'}
              </div>
            </div>
          </div>
        </div>
        <div className="page__body">
          {!isNew && detailQuery.isError ? (
            <div className="empty">
              <h2>Не удалось загрузить лорбук</h2>
              <p>Проверьте rewrite API и повторите попытку.</p>
            </div>
          ) : (
            <form className="col gap-12" id="lorebook-editor-form" onSubmit={handleSubmit} style={{ maxWidth: 1100 }}>
              <div className="row gap-12" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <Field id="lorebook-name" label="Название" required>
                    <input
                      className="input"
                      disabled={saveMutation.isPending}
                      id="lorebook-name"
                      maxLength={200}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.currentTarget.value }))}
                      placeholder="Например: Студия «Меандр»"
                      value={form.name}
                    />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field id="lorebook-tags" label="Теги" hint="Через запятую.">
                    <input
                      className="input"
                      disabled={saveMutation.isPending}
                      id="lorebook-tags"
                      onChange={(event) => setForm((current) => ({ ...current, tagsText: event.currentTarget.value }))}
                      placeholder="город, ремесло"
                      value={form.tagsText}
                    />
                  </Field>
                </div>
              </div>

              <div className="between" style={{ marginTop: 8 }}>
                <strong style={{ fontSize: 'var(--fz-md)' }}>Записи</strong>
                <button className="btn btn--xs" onClick={addEntry} type="button">
                  <PlusIcon size={12} /> Добавить запись
                </button>
              </div>

              {form.entries.length === 0 ? (
                <div className="card" style={{ padding: 18, textAlign: 'center' }}>
                  <p className="muted" style={{ fontSize: 'var(--fz-sm)' }}>
                    Записей пока нет. Каждая запись срабатывает, когда в контексте встречается одно из её ключевых слов.
                  </p>
                </div>
              ) : (
                <div className="col gap-10">
                  {form.entries.map((entry, index) => (
                    <EntryCard
                      busy={saveMutation.isPending}
                      entry={entry}
                      index={index}
                      key={index}
                      onChange={(patch) => updateEntry(index, patch)}
                      onRemove={() => removeEntry(index)}
                    />
                  ))}
                </div>
              )}

              {errorMessage ? (
                <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', padding: 12 }}>
                  {errorMessage}
                </div>
              ) : null}
              {deleteError ? (
                <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', padding: 12 }}>
                  {deleteError}
                </div>
              ) : null}
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

interface EntryCardProps {
  busy: boolean;
  entry: EditorEntry;
  index: number;
  onChange: (patch: Partial<EditorEntry>) => void;
  onRemove: () => void;
}

function EntryCard({ busy, entry, index, onChange, onRemove }: EntryCardProps) {
  return (
    <div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
      <div className="row gap-8" style={{ alignItems: 'center' }}>
        <span className="muted mono" style={{ fontSize: 'var(--fz-xs)' }}>
          #{index + 1}
        </span>
        <label className="row gap-4" style={{ alignItems: 'center', fontSize: 'var(--fz-xs)' }}>
          <input
            checked={entry.enabled}
            disabled={busy}
            onChange={(event) => onChange({ enabled: event.currentTarget.checked })}
            type="checkbox"
          />
          включена
        </label>
        <label className="row gap-4" style={{ alignItems: 'center', fontSize: 'var(--fz-xs)' }}>
          приоритет
          <input
            className="input"
            disabled={busy}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              onChange({ priority: Number.isFinite(next) ? next : 0 });
            }}
            style={{ width: 80 }}
            type="number"
            value={entry.priority}
          />
        </label>
        <div style={{ flex: 1 }} />
        <button
          className="btn btn--xs btn--icon"
          disabled={busy}
          onClick={onRemove}
          title="Удалить запись"
          type="button"
        >
          <TrashIcon size={12} />
        </button>
      </div>
      <Field id={`lorebook-entry-keys-${index}`} label="Ключи" hint="Через запятую. Регистр не важен.">
        <input
          className="input"
          disabled={busy}
          id={`lorebook-entry-keys-${index}`}
          onChange={(event) => onChange({ keysText: event.currentTarget.value })}
          placeholder="например: Меандр, студия, обжиг"
          value={entry.keysText}
        />
      </Field>
      <Field id={`lorebook-entry-content-${index}`} label="Контекст">
        <textarea
          className="textarea"
          disabled={busy}
          id={`lorebook-entry-content-${index}`}
          maxLength={20_000}
          onChange={(event) => onChange({ content: event.currentTarget.value })}
          rows={4}
          value={entry.content}
        />
      </Field>
    </div>
  );
}

interface FieldProps {
  children: ReactNode;
  hint?: string;
  id: string;
  label: string;
  required?: boolean;
}

function Field({ children, hint, id, label, required }: FieldProps) {
  return (
    <div className="field">
      <label className="between" htmlFor={id}>
        <span>
          {label}
          {required ? <span style={{ color: 'var(--danger)' }}> *</span> : null}
        </span>
      </label>
      {children}
      {hint ? (
        <div className="muted" style={{ fontSize: 'var(--fz-2xs)', marginTop: 4 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
