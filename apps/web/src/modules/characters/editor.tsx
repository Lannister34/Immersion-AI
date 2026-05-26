import type { CharacterDetailDto, SaveCharacterCommand } from '@immersion/contracts/characters';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';

import { Topbar } from '../../app/layout/topbar';
import { ApiError, createApiUrl } from '../../shared/api/client';
import { ChatIcon, TrashIcon } from '../../shared/ui/icons';
import { createChat } from '../chats/api/create-chat';
import { chatListQueryKey } from '../chats/queries/chat-list-query';
import { createCharacter, updateCharacter } from './api/save-character';
import { useDeleteCharacter } from './mutations/use-delete-character';
import { characterDetailQueryKey, characterDetailQueryOptions } from './queries/character-detail-query';
import { characterListQueryKey } from './queries/character-list-query';

interface CharacterEditorScreenProps {
  characterId: string | null;
}

interface CharacterFormState {
  description: string;
  exampleDialogue: string;
  firstMessage: string;
  name: string;
  personality: string;
  scenario: string;
  systemPrompt: string;
  tagsText: string;
}

function toFormState(detail: CharacterDetailDto | null): CharacterFormState {
  if (!detail) {
    return {
      description: '',
      exampleDialogue: '',
      firstMessage: '',
      name: '',
      personality: '',
      scenario: '',
      systemPrompt: '',
      tagsText: '',
    };
  }
  return {
    description: detail.description,
    exampleDialogue: detail.exampleDialogue,
    firstMessage: detail.firstMessage,
    name: detail.name,
    personality: detail.personality,
    scenario: detail.scenario,
    systemPrompt: detail.systemPrompt,
    tagsText: detail.tags.join(', '),
  };
}

function toCommand(state: CharacterFormState): SaveCharacterCommand {
  return {
    description: state.description,
    exampleDialogue: state.exampleDialogue,
    firstMessage: state.firstMessage,
    name: state.name.trim(),
    personality: state.personality,
    scenario: state.scenario,
    systemPrompt: state.systemPrompt,
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

export function CharacterEditorScreen({ characterId }: CharacterEditorScreenProps) {
  const isNew = characterId === null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({
    ...characterDetailQueryOptions(characterId ?? ''),
    enabled: !isNew,
  });
  const detail = isNew ? null : (detailQuery.data?.character ?? null);

  const initialState = useMemo(() => toFormState(detail), [detail]);
  const [form, setForm] = useState<CharacterFormState>(initialState);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setForm(initialState);
  }, [initialState]);

  const isDirty =
    form.name !== initialState.name ||
    form.description !== initialState.description ||
    form.personality !== initialState.personality ||
    form.scenario !== initialState.scenario ||
    form.firstMessage !== initialState.firstMessage ||
    form.exampleDialogue !== initialState.exampleDialogue ||
    form.systemPrompt !== initialState.systemPrompt ||
    form.tagsText !== initialState.tagsText;

  const canEdit = isNew || detail?.isEditable === true;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const command = toCommand(form);
      if (isNew) {
        return createCharacter(command);
      }
      return updateCharacter(characterId, command);
    },
    onSuccess: async (response) => {
      queryClient.setQueryData(characterDetailQueryKey(response.character.id), response);
      await queryClient.invalidateQueries({ queryKey: characterListQueryKey });
      if (isNew) {
        await navigate({ to: '/characters/$characterId', params: { characterId: response.character.id } });
      }
    },
  });

  const deleteMutation = useDeleteCharacter(characterId ?? '', {
    onSuccess: async () => {
      await navigate({ to: '/characters' });
    },
  });

  const startChatMutation = useMutation({
    mutationFn: () => {
      if (isNew || !characterId) {
        throw new Error('Need a saved character first.');
      }
      return createChat({ characterId });
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      await navigate({ to: '/chat/$chatId', params: { chatId: response.chat.id } });
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) return;
    const trimmed = form.name.trim();
    if (!trimmed) return;
    saveMutation.mutate();
  };

  const errorMessage =
    saveMutation.error instanceof ApiError
      ? saveMutation.error.message
      : saveMutation.error
        ? 'Не удалось сохранить персонажа.'
        : null;
  const deleteError =
    deleteMutation.error instanceof ApiError
      ? deleteMutation.error.message
      : deleteMutation.error
        ? 'Не удалось удалить персонажа.'
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
                  удалить персонажа?
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
              <>
                <button
                  className="btn btn--primary"
                  disabled={
                    startChatMutation.isPending || saveMutation.isPending || deleteMutation.isPending || isDirty
                  }
                  onClick={() => startChatMutation.mutate()}
                  title={isDirty ? 'Сначала сохрани изменения' : 'Создать новый чат с этим персонажем'}
                  type="button"
                >
                  <ChatIcon size={14} /> {startChatMutation.isPending ? '…' : 'Начать чат'}
                </button>
                <button
                  className="btn"
                  disabled={saveMutation.isPending || deleteMutation.isPending}
                  onClick={() => setConfirmDelete(true)}
                  title="Удалить файл персонажа"
                  type="button"
                >
                  <TrashIcon size={14} /> Удалить
                </button>
              </>
            ) : null}
            <button
              className="btn btn--primary"
              disabled={
                !canEdit ||
                saveMutation.isPending ||
                deleteMutation.isPending ||
                !isDirty ||
                form.name.trim().length === 0
              }
              form="character-editor-form"
              type="submit"
            >
              {saveMutation.isPending ? 'Сохраняем…' : isNew ? 'Создать' : 'Сохранить'}
            </button>
          </>
        }
        crumbs={[
          { label: 'Персонажи' },
          { label: isNew ? 'Новый персонаж' : (detail?.name ?? characterId ?? 'Персонаж'), strong: true },
        ]}
        search={false}
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">{isNew ? 'Новый персонаж' : (detail?.name ?? 'Загрузка…')}</h1>
              <div className="page__sub">
                {isNew
                  ? 'Создаём JSON-карточку в data/characters/'
                  : detailQuery.isLoading
                    ? 'Загружаем карточку…'
                    : detail
                      ? `${detail.source.toUpperCase()} · сохранён ${formatRelative(detail.updatedAt)} · ${detail.id}`
                      : 'Не удалось загрузить карточку'}
              </div>
            </div>
          </div>
        </div>
        <div className="page__body">
          {!isNew && detailQuery.isError ? (
            <div className="empty">
              <h2>Не удалось загрузить карточку</h2>
              <p>Проверьте rewrite API и повторите попытку.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 18, maxWidth: 1100 }}>
              <form className="col gap-12" id="character-editor-form" onSubmit={handleSubmit}>
                <Field id="character-name" label="Имя" required>
                  <input
                    className="input"
                    disabled={!canEdit || saveMutation.isPending}
                    id="character-name"
                    maxLength={200}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.currentTarget.value }))}
                    placeholder="Например: Эля"
                    value={form.name}
                  />
                </Field>
                <Field hint="Кто это, чем занимается, ключевые черты." id="character-description" label="Описание">
                  <textarea
                    className="textarea"
                    disabled={!canEdit || saveMutation.isPending}
                    id="character-description"
                    maxLength={20_000}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.currentTarget.value }))}
                    rows={6}
                    value={form.description}
                  />
                </Field>
                <Field hint="Темперамент, манера речи, реакции." id="character-personality" label="Личность">
                  <textarea
                    className="textarea"
                    disabled={!canEdit || saveMutation.isPending}
                    id="character-personality"
                    maxLength={5_000}
                    onChange={(event) => setForm((current) => ({ ...current, personality: event.currentTarget.value }))}
                    rows={4}
                    value={form.personality}
                  />
                </Field>
                <Field
                  hint="Стартовая сцена, в которой персонаж находится по умолчанию."
                  id="character-scenario"
                  label="Сцена"
                >
                  <textarea
                    className="textarea"
                    disabled={!canEdit || saveMutation.isPending}
                    id="character-scenario"
                    maxLength={5_000}
                    onChange={(event) => setForm((current) => ({ ...current, scenario: event.currentTarget.value }))}
                    rows={3}
                    value={form.scenario}
                  />
                </Field>
                <Field
                  hint="Первое сообщение, которое отправляет персонаж в начале чата."
                  id="character-first-mes"
                  label="Первая фраза"
                >
                  <textarea
                    className="textarea"
                    disabled={!canEdit || saveMutation.isPending}
                    id="character-first-mes"
                    maxLength={20_000}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, firstMessage: event.currentTarget.value }))
                    }
                    rows={4}
                    value={form.firstMessage}
                  />
                </Field>
                <Field
                  hint="Примеры реплик в формате SillyTavern — помогают модели держать стиль."
                  id="character-mes-example"
                  label="Примеры диалогов"
                >
                  <textarea
                    className="textarea"
                    disabled={!canEdit || saveMutation.isPending}
                    id="character-mes-example"
                    maxLength={20_000}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, exampleDialogue: event.currentTarget.value }))
                    }
                    rows={5}
                    value={form.exampleDialogue}
                  />
                </Field>
                <Field
                  hint="System prompt именно для этого персонажа. Перекроет глобальный."
                  id="character-system-prompt"
                  label="System Prompt (опционально)"
                >
                  <textarea
                    className="textarea"
                    disabled={!canEdit || saveMutation.isPending}
                    id="character-system-prompt"
                    maxLength={20_000}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, systemPrompt: event.currentTarget.value }))
                    }
                    rows={4}
                    value={form.systemPrompt}
                  />
                </Field>
                <Field hint="Через запятую." id="character-tags" label="Теги">
                  <input
                    className="input"
                    disabled={!canEdit || saveMutation.isPending}
                    id="character-tags"
                    onChange={(event) => setForm((current) => ({ ...current, tagsText: event.currentTarget.value }))}
                    placeholder="ru, slice-of-life, ремесло"
                    value={form.tagsText}
                  />
                </Field>
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
              <aside className="col gap-12">
                <div className="card" style={{ padding: 12 }}>
                  <div className="muted" style={{ fontSize: 'var(--fz-xs)', marginBottom: 8 }}>
                    Аватар
                  </div>
                  <div
                    style={{
                      aspectRatio: '1 / 1',
                      borderRadius: 12,
                      background: detail?.avatarUrl
                        ? `center / cover no-repeat url("${createApiUrl(detail.avatarUrl)}")`
                        : 'var(--surface-2)',
                      border: '1px solid var(--hairline)',
                    }}
                  />
                  <div className="muted" style={{ fontSize: 'var(--fz-2xs)', marginTop: 8 }}>
                    {detail?.avatarUrl
                      ? 'Аватар берётся из PNG-карточки той же библиотеки.'
                      : 'Аватар появится, если рядом лежит PNG-карточка с тем же именем.'}
                  </div>
                </div>
                {detail?.source === 'png' && canEdit ? (
                  <div className="card" style={{ padding: 12 }}>
                    <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
                      Карточка хранится в формате PNG SillyTavern. Сохранение перезаписывает <code>chara</code>-чанк
                      внутри файла — пиксели аватара не меняются.
                    </div>
                  </div>
                ) : !canEdit && detail ? (
                  <div className="card" style={{ padding: 12 }}>
                    <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
                      Этот файл не похож на SillyTavern PNG — редактирование недоступно.
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>
          )}
        </div>
      </div>
    </main>
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
