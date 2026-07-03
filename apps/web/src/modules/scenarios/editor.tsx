import type { SaveScenarioCommand, ScenarioDetailDto } from '@immersion/contracts/scenarios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { Topbar } from '../../app/layout/topbar';
import { getApiErrorMessage } from '../../shared/api/get-api-error-message';
import { formatRelative } from '../../shared/lib/format-relative';
import { Field } from '../../shared/ui/field';
import { ChatIcon, TrashIcon } from '../../shared/ui/icons';
import { createChat } from '../chats/api/create-chat';
import { chatListQueryKey } from '../chats/queries/chat-list-query';
import { createScenario, updateScenario } from './api/save-scenario';
import { useDeleteScenario } from './mutations/use-delete-scenario';
import { scenarioDetailQueryKey, scenarioDetailQueryOptions } from './queries/scenario-detail-query';
import { scenarioListQueryKey } from './queries/scenario-list-query';

interface ScenarioEditorScreenProps {
  scenarioId: string | null;
}

interface ScenarioFormState {
  concept: string;
  content: string;
  name: string;
  tagsText: string;
}

function toFormState(detail: ScenarioDetailDto | null): ScenarioFormState {
  if (!detail) {
    return { concept: '', content: '', name: '', tagsText: '' };
  }
  return {
    concept: detail.concept,
    content: detail.content,
    name: detail.name,
    tagsText: detail.tags.join(', '),
  };
}

function toCommand(state: ScenarioFormState): SaveScenarioCommand {
  return {
    concept: state.concept.trim(),
    content: state.content,
    name: state.name.trim(),
    tags: state.tagsText
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
  };
}

function formsEqual(left: ScenarioFormState, right: ScenarioFormState): boolean {
  return (
    left.concept === right.concept &&
    left.content === right.content &&
    left.name === right.name &&
    left.tagsText === right.tagsText
  );
}

export function ScenarioEditorScreen({ scenarioId }: ScenarioEditorScreenProps) {
  const isNew = scenarioId === null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({
    ...scenarioDetailQueryOptions(scenarioId ?? ''),
    enabled: !isNew,
  });
  const detail = isNew ? null : (detailQuery.data?.scenario ?? null);

  const initialState = useMemo(() => toFormState(detail), [detail]);
  const [form, setForm] = useState<ScenarioFormState>(initialState);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const appliedInitialStateRef = useRef(initialState);

  // Сбрасываем форму на серверное состояние только пока пользователь её не редактировал.
  useEffect(() => {
    const previousInitialState = appliedInitialStateRef.current;
    appliedInitialStateRef.current = initialState;
    setForm((current) => (formsEqual(current, previousInitialState) ? initialState : current));
  }, [initialState]);

  const isDirty = !formsEqual(form, initialState);

  // Значение читаем из события синхронно: внутри отложенного апдейтера
  // event.currentTarget уже null, и чтение .value роняет экран.
  const setField = <K extends keyof ScenarioFormState>(field: K, value: ScenarioFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const command = toCommand(form);
      if (isNew) {
        return createScenario(command);
      }
      return updateScenario(scenarioId, command);
    },
    onSuccess: async (response) => {
      queryClient.setQueryData(scenarioDetailQueryKey(response.scenario.id), response);
      await queryClient.invalidateQueries({ queryKey: scenarioListQueryKey });
      if (isNew) {
        await navigate({ to: '/scenarios/$scenarioId', params: { scenarioId: response.scenario.id } });
      }
    },
  });

  const deleteMutation = useDeleteScenario(scenarioId ?? '', {
    onSuccess: async () => {
      await navigate({ to: '/scenarios' });
    },
  });

  const startChatMutation = useMutation({
    mutationFn: () => {
      if (isNew || !scenarioId) {
        throw new Error('Need a saved scenario first.');
      }
      return createChat({ scenarioId });
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      await navigate({ to: '/chat/$chatId', params: { chatId: response.chat.id } });
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = form.name.trim();
    if (!trimmed) return;
    saveMutation.mutate();
  };

  const errorMessage = saveMutation.error
    ? getApiErrorMessage(saveMutation.error, 'Не удалось сохранить сценарий. Проверьте поля и повторите.')
    : null;
  const deleteError = deleteMutation.error
    ? getApiErrorMessage(deleteMutation.error, 'Не удалось удалить сценарий.')
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
                  удалить сценарий?
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
                  title={isDirty ? 'Сначала сохрани изменения' : 'Создать новый чат с этим сценарием'}
                  type="button"
                >
                  <ChatIcon size={14} /> {startChatMutation.isPending ? '…' : 'Начать чат'}
                </button>
                <button
                  className="btn"
                  disabled={saveMutation.isPending || deleteMutation.isPending}
                  onClick={() => setConfirmDelete(true)}
                  title="Удалить сценарий"
                  type="button"
                >
                  <TrashIcon size={14} /> Удалить
                </button>
              </>
            ) : null}
            <button
              className="btn btn--primary"
              disabled={saveMutation.isPending || deleteMutation.isPending || !isDirty || form.name.trim().length === 0}
              form="scenario-editor-form"
              type="submit"
            >
              {saveMutation.isPending ? 'Сохраняем…' : isNew ? 'Создать' : 'Сохранить'}
            </button>
          </>
        }
        crumbs={[
          { label: 'Сценарии' },
          { label: isNew ? 'Новый сценарий' : (detail?.name ?? scenarioId ?? 'Сценарий'), strong: true },
        ]}
        search={false}
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">{isNew ? 'Новый сценарий' : (detail?.name ?? 'Загрузка…')}</h1>
              <div className="page__sub">
                {isNew
                  ? 'Создаём новый файл в data/scenarios/'
                  : detailQuery.isLoading
                    ? 'Загружаем сценарий…'
                    : detail
                      ? `Сохранён ${formatRelative(detail.updatedAt)} · ${detail.id}`
                      : 'Не удалось загрузить сценарий'}
              </div>
            </div>
          </div>
        </div>
        <div className="page__body">
          {!isNew && detailQuery.isError ? (
            <div className="empty">
              <h2>Не удалось загрузить сценарий</h2>
              <p>Проверьте rewrite API и повторите попытку.</p>
            </div>
          ) : (
            <form className="col gap-12" id="scenario-editor-form" onSubmit={handleSubmit} style={{ maxWidth: 900 }}>
              <Field id="scenario-name" label="Название" required>
                <input
                  className="input"
                  disabled={saveMutation.isPending}
                  id="scenario-name"
                  maxLength={200}
                  onChange={(event) => setField('name', event.currentTarget.value)}
                  placeholder="Например: Анонимный чат"
                  value={form.name}
                />
              </Field>
              <Field
                hint="Короткая фраза о ситуации — показывается в карточке сценария."
                id="scenario-concept"
                label="Концепт"
              >
                <input
                  className="input"
                  disabled={saveMutation.isPending}
                  id="scenario-concept"
                  maxLength={2000}
                  onChange={(event) => setField('concept', event.currentTarget.value)}
                  value={form.concept}
                />
              </Field>
              <Field
                hint="Полное описание сцены. Поддерживает плейсхолдеры {{user}} и {{char}}."
                id="scenario-content"
                label="Сцена"
              >
                <textarea
                  className="textarea"
                  disabled={saveMutation.isPending}
                  id="scenario-content"
                  maxLength={20_000}
                  onChange={(event) => setField('content', event.currentTarget.value)}
                  rows={10}
                  value={form.content}
                />
              </Field>
              <Field hint="Через запятую: до 50 тегов, каждый до 60 символов." id="scenario-tags" label="Теги">
                <input
                  className="input"
                  disabled={saveMutation.isPending}
                  id="scenario-tags"
                  onChange={(event) => setField('tagsText', event.currentTarget.value)}
                  placeholder="онлайн, знакомство, любопытство"
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
          )}
        </div>
      </div>
    </main>
  );
}
