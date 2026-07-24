import type { LorebookDetailDto, LorebookEntryDto, SaveLorebookCommand } from '@immersion/contracts/lorebooks';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { Topbar } from '../../app/layout/topbar';
import { getApiErrorMessage } from '../../shared/api/get-api-error-message';
import { formatRelative } from '../../shared/lib/format-relative';
import { pluralRu } from '../../shared/lib/plural';
import { Field } from '../../shared/ui/field';
import { PlusIcon, SparkleIcon, TrashIcon } from '../../shared/ui/icons';
import { TemplateTextarea } from '../../shared/ui/template-textarea';
import { generateLorebookDraft, useGenerationAvailability } from '../generation';
import { createLorebook, updateLorebook } from './api/save-lorebook';
import { useDeleteLorebook } from './mutations/use-delete-lorebook';
import { lorebookDetailQueryKey, lorebookDetailQueryOptions } from './queries/lorebook-detail-query';
import { lorebookListQueryKey } from './queries/lorebook-list-query';

function entryCountLabel(count: number): string {
  return pluralRu(count, ['запись', 'записи', 'записей']);
}

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

function emptyEntry(): EditorEntry {
  return { content: '', enabled: true, keysText: '', priority: 0 };
}

function entriesEqual(left: EditorEntry[], right: EditorEntry[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      entry.content === other.content &&
      entry.enabled === other.enabled &&
      entry.keysText === other.keysText &&
      entry.priority === other.priority
    );
  });
}

function formsEqual(left: LorebookFormState, right: LorebookFormState): boolean {
  return left.name === right.name && left.tagsText === right.tagsText && entriesEqual(left.entries, right.entries);
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
  const [draftConcept, setDraftConcept] = useState('');
  const appliedInitialStateRef = useRef(initialState);

  // Сбрасываем форму на серверное состояние только пока пользователь её не редактировал.
  useEffect(() => {
    const previousInitialState = appliedInitialStateRef.current;
    appliedInitialStateRef.current = initialState;
    setForm((current) => (formsEqual(current, previousInitialState) ? initialState : current));
  }, [initialState]);

  const isDirty = useMemo(() => !formsEqual(form, initialState), [form, initialState]);

  // Значение читаем из события синхронно: внутри отложенного апдейтера
  // event.currentTarget уже null, и чтение .value роняет экран.
  const setField = <K extends keyof LorebookFormState>(field: K, value: LorebookFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

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

  const deleteMutation = useDeleteLorebook(lorebookId ?? '', {
    onSuccess: async () => {
      await navigate({ to: '/lorebooks' });
    },
  });

  const generationAvailability = useGenerationAvailability();

  const generateEntriesMutation = useMutation({
    mutationFn: (concept: string) => generateLorebookDraft(concept),
    onSuccess: (draft) => {
      // Сгенерированные записи добавляем к существующим, пользовательские не трогаем.
      setForm((current) => ({
        ...current,
        entries: [
          ...current.entries,
          ...draft.entries.map((entry) => ({
            content: entry.content,
            enabled: true,
            keysText: entry.keys.join(', '),
            priority: 0,
          })),
        ],
        name: current.name.trim().length > 0 ? current.name : draft.name,
      }));
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

  const errorMessage = saveMutation.error
    ? getApiErrorMessage(saveMutation.error, 'Не удалось сохранить лорбук.')
    : null;
  const deleteError = deleteMutation.error
    ? getApiErrorMessage(deleteMutation.error, 'Не удалось удалить лорбук.')
    : null;
  const generateEntriesError = generateEntriesMutation.error
    ? getApiErrorMessage(generateEntriesMutation.error, 'Не удалось сгенерировать записи. Попробуйте ещё раз.')
    : null;

  let entityActions: ReactNode = null;
  if (!isNew && confirmDelete) {
    entityActions = (
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
    );
  } else if (!isNew) {
    entityActions = (
      <button
        className="btn"
        disabled={saveMutation.isPending || deleteMutation.isPending}
        onClick={() => setConfirmDelete(true)}
        title="Удалить файл лорбука"
        type="button"
      >
        <TrashIcon size={14} /> Удалить
      </button>
    );
  }

  let submitLabel = isNew ? 'Создать' : 'Сохранить';
  if (saveMutation.isPending) {
    submitLabel = 'Сохраняем…';
  }

  let subtitle = 'Создаём файл в data/worlds/';
  if (!isNew) {
    if (detailQuery.isLoading) {
      subtitle = 'Загружаем…';
    } else if (detail) {
      subtitle = `${entryCountLabel(detail.entries.length)} · сохранён ${formatRelative(detail.updatedAt)}`;
    } else {
      subtitle = 'Не удалось загрузить лорбук';
    }
  }

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
            {entityActions}
            <button
              className="btn btn--primary"
              disabled={saveMutation.isPending || deleteMutation.isPending || !isDirty || form.name.trim().length === 0}
              form="lorebook-editor-form"
              type="submit"
            >
              {submitLabel}
            </button>
          </>
        }
        crumbs={[
          { label: 'Лорбуки', to: '/lorebooks' },
          { label: isNew ? 'Новый лорбук' : (detail?.name ?? lorebookId ?? 'Лорбук'), strong: true },
        ]}
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">{isNew ? 'Новый лорбук' : (detail?.name ?? 'Загрузка…')}</h1>
              <div className="page__sub">{subtitle}</div>
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
            <form
              className="col gap-12"
              id="lorebook-editor-form"
              onSubmit={handleSubmit}
              style={{ maxWidth: 1100, margin: '0 auto' }}
            >
              <div className="row gap-12" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <Field id="lorebook-name" label="Название" required>
                    <input
                      className="input"
                      disabled={saveMutation.isPending}
                      id="lorebook-name"
                      maxLength={200}
                      onChange={(event) => setField('name', event.currentTarget.value)}
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
                      onChange={(event) => setField('tagsText', event.currentTarget.value)}
                      placeholder="город, ремесло"
                      value={form.tagsText}
                    />
                  </Field>
                </div>
              </div>

              <Field
                hint={
                  generationAvailability.blockReason ??
                  'Опишите мир или тему — модель добавит черновые записи к существующим, сохранение остаётся за вами.'
                }
                id="lorebook-draft-concept"
                label="Концепт для генерации"
              >
                <div className="row gap-8">
                  <input
                    className="input"
                    disabled={saveMutation.isPending || generateEntriesMutation.isPending}
                    id="lorebook-draft-concept"
                    maxLength={2000}
                    onChange={(event) => setDraftConcept(event.currentTarget.value)}
                    placeholder="Например: портовый город на краю штормового моря"
                    style={{ flex: 1 }}
                    value={draftConcept}
                  />
                  <button
                    className="btn"
                    disabled={
                      saveMutation.isPending ||
                      generateEntriesMutation.isPending ||
                      generationAvailability.isBlocked ||
                      draftConcept.trim().length === 0
                    }
                    onClick={() => {
                      const concept = draftConcept.trim();
                      if (!generateEntriesMutation.isPending && concept.length > 0) {
                        generateEntriesMutation.mutate(concept);
                      }
                    }}
                    title={generationAvailability.blockReason ?? 'Сгенерировать черновые записи по концепту'}
                    type="button"
                  >
                    <SparkleIcon size={14} />{' '}
                    {generateEntriesMutation.isPending ? 'Генерируем…' : 'Сгенерировать записи'}
                  </button>
                </div>
              </Field>
              {generateEntriesError ? (
                <div style={{ color: 'var(--danger)', fontSize: 'var(--fz-xs)' }}>{generateEntriesError}</div>
              ) : null}

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
        <TemplateTextarea
          disabled={busy}
          id={`lorebook-entry-content-${index}`}
          maxLength={20_000}
          onChange={(next) => onChange({ content: next })}
          rows={4}
          value={entry.content}
        />
      </Field>
    </div>
  );
}
