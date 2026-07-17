import type { SaveScenarioCommand, ScenarioDetailDto } from '@immersion/contracts/scenarios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { Topbar } from '../../app/layout/topbar';
import { getApiErrorMessage } from '../../shared/api/get-api-error-message';
import { formatRelative } from '../../shared/lib/format-relative';
import { Field } from '../../shared/ui/field';
import { ChatIcon, SparkleIcon, TrashIcon } from '../../shared/ui/icons';
import { createChat } from '../chats/api/create-chat';
import { chatListQueryKey } from '../chats/queries/chat-list-query';
import { generateScenarioDraft, generateScenarioFirstMessage, useGenerationAvailability } from '../generation';
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
  firstMessage: string;
  name: string;
  tagsText: string;
}

function toFormState(detail: ScenarioDetailDto | null): ScenarioFormState {
  if (!detail) {
    return { concept: '', content: '', firstMessage: '', name: '', tagsText: '' };
  }
  return {
    concept: detail.concept,
    content: detail.content,
    firstMessage: detail.firstMessage,
    name: detail.name,
    tagsText: detail.tags.join(', '),
  };
}

function toCommand(state: ScenarioFormState): SaveScenarioCommand {
  return {
    concept: state.concept.trim(),
    content: state.content,
    firstMessage: state.firstMessage.trim(),
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
    left.firstMessage === right.firstMessage &&
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

  const generationAvailability = useGenerationAvailability();

  const draftMutation = useMutation({
    mutationFn: () => {
      const concept = form.concept.trim();
      const name = form.name.trim();
      return generateScenarioDraft({ concept, ...(name.length > 0 ? { name } : {}) });
    },
    onSuccess: (draft) => {
      // Черновик заполняет форму; название не трогаем, если пользователь его уже ввёл.
      // Пустую первую фразу от модели не применяем — не затираем написанное вручную.
      setForm((current) => ({
        ...current,
        content: draft.content,
        firstMessage: draft.firstMessage.trim().length > 0 ? draft.firstMessage : current.firstMessage,
        name: current.name.trim().length > 0 ? current.name : draft.name,
        tagsText: draft.tags.join(', '),
      }));
    },
  });

  const firstMessageMutation = useMutation({
    mutationFn: () => {
      const concept = form.concept.trim();
      const name = form.name.trim();
      const content = form.content.trim();
      return generateScenarioFirstMessage({
        concept,
        ...(content.length > 0 ? { content } : {}),
        ...(name.length > 0 ? { name } : {}),
      });
    },
    onSuccess: (response) => {
      setForm((current) => ({ ...current, firstMessage: response.value }));
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
  const draftGenerationError = draftMutation.error
    ? getApiErrorMessage(draftMutation.error, 'Не удалось сгенерировать сценарий. Попробуйте ещё раз.')
    : null;
  const firstMessageGenerationError = firstMessageMutation.error
    ? getApiErrorMessage(firstMessageMutation.error, 'Не удалось сгенерировать первую фразу. Попробуйте ещё раз.')
    : null;

  let entityActions: ReactNode = null;
  if (!isNew && confirmDelete) {
    entityActions = (
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
    );
  } else if (!isNew) {
    entityActions = (
      <>
        <button
          className="btn btn--primary"
          disabled={startChatMutation.isPending || saveMutation.isPending || deleteMutation.isPending || isDirty}
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
    );
  }

  let submitLabel = isNew ? 'Создать' : 'Сохранить';
  if (saveMutation.isPending) {
    submitLabel = 'Сохраняем…';
  }

  let subtitle = 'Создаём новый файл в data/scenarios/';
  if (!isNew) {
    if (detailQuery.isLoading) {
      subtitle = 'Загружаем сценарий…';
    } else if (detail) {
      subtitle = `Сохранён ${formatRelative(detail.updatedAt)} · ${detail.id}`;
    } else {
      subtitle = 'Не удалось загрузить сценарий';
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
              form="scenario-editor-form"
              type="submit"
            >
              {submitLabel}
            </button>
          </>
        }
        crumbs={[
          { label: 'Сценарии', to: '/scenarios' },
          { label: isNew ? 'Новый сценарий' : (detail?.name ?? scenarioId ?? 'Сценарий'), strong: true },
        ]}
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">{isNew ? 'Новый сценарий' : (detail?.name ?? 'Загрузка…')}</h1>
              <div className="page__sub">{subtitle}</div>
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
            <form
              className="col gap-12"
              id="scenario-editor-form"
              onSubmit={handleSubmit}
              style={{ maxWidth: 960, margin: '0 auto' }}
            >
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
                action={
                  <button
                    className="btn btn--xs"
                    disabled={
                      saveMutation.isPending ||
                      draftMutation.isPending ||
                      generationAvailability.isBlocked ||
                      form.concept.trim().length === 0
                    }
                    onClick={() => {
                      if (!draftMutation.isPending) {
                        draftMutation.mutate();
                      }
                    }}
                    title={generationAvailability.blockReason ?? 'Сгенерировать сцену, название и теги по концепту'}
                    type="button"
                  >
                    <SparkleIcon size={12} /> {draftMutation.isPending ? 'Генерируем…' : 'Сгенерировать по концепту'}
                  </button>
                }
                hint="Короткая фраза о ситуации — показывается в карточке сценария."
                id="scenario-concept"
                label="Концепт"
              >
                <input
                  className="input"
                  disabled={saveMutation.isPending || draftMutation.isPending}
                  id="scenario-concept"
                  maxLength={2000}
                  onChange={(event) => setField('concept', event.currentTarget.value)}
                  value={form.concept}
                />
              </Field>
              {draftGenerationError ? (
                <div style={{ color: 'var(--danger)', fontSize: 'var(--fz-xs)' }}>{draftGenerationError}</div>
              ) : null}
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
              <Field
                action={
                  <button
                    className="btn btn--xs"
                    disabled={
                      saveMutation.isPending ||
                      firstMessageMutation.isPending ||
                      generationAvailability.isBlocked ||
                      form.concept.trim().length === 0
                    }
                    onClick={() => {
                      if (!firstMessageMutation.isPending) {
                        firstMessageMutation.mutate();
                      }
                    }}
                    title={generationAvailability.blockReason ?? 'Сгенерировать первую фразу по концепту и сцене'}
                    type="button"
                  >
                    <SparkleIcon size={12} />{' '}
                    {firstMessageMutation.isPending ? 'Генерируем…' : 'Сгенерировать первую фразу'}
                  </button>
                }
                hint="Приветствие сцены — вставляется при создании чата с этим сценарием."
                id="scenario-first-message"
                label="Первая фраза"
              >
                <textarea
                  className="textarea"
                  disabled={saveMutation.isPending || firstMessageMutation.isPending}
                  id="scenario-first-message"
                  maxLength={20_000}
                  onChange={(event) => setField('firstMessage', event.currentTarget.value)}
                  rows={5}
                  value={form.firstMessage}
                />
              </Field>
              {firstMessageGenerationError ? (
                <div style={{ color: 'var(--danger)', fontSize: 'var(--fz-xs)' }}>{firstMessageGenerationError}</div>
              ) : null}
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
