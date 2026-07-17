import type { CharacterDetailDto, SaveCharacterCommand } from '@immersion/contracts/characters';
import type { CharacterDraftFieldName, CharacterDraftFields } from '@immersion/contracts/generation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { Topbar } from '../../app/layout/topbar';
import { createApiUrl } from '../../shared/api/client';
import { getApiErrorMessage } from '../../shared/api/get-api-error-message';
import { formatRelative } from '../../shared/lib/format-relative';
import { Field } from '../../shared/ui/field';
import { ChatIcon, CopyIcon, SparkleIcon, TrashIcon } from '../../shared/ui/icons';
import { createChat } from '../chats/api/create-chat';
import { chatListQueryKey } from '../chats/queries/chat-list-query';
import {
  generateCharacterAvatarPrompt,
  generateCharacterDraft,
  generateCharacterField,
  useGenerationAvailability,
} from '../generation';
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

type AvatarCopyState = 'copied' | 'failed' | 'idle';

const AVATAR_COPY_LABELS: Record<AvatarCopyState, string> = {
  copied: 'Скопировано',
  failed: 'Не удалось скопировать',
  idle: 'Скопировать',
};

function toDraftFields(state: CharacterFormState): CharacterDraftFields {
  return {
    description: state.description,
    exampleDialogue: state.exampleDialogue,
    firstMessage: state.firstMessage,
    name: state.name,
    personality: state.personality,
    scenario: state.scenario,
  };
}

function formsEqual(left: CharacterFormState, right: CharacterFormState): boolean {
  return (
    left.description === right.description &&
    left.exampleDialogue === right.exampleDialogue &&
    left.firstMessage === right.firstMessage &&
    left.name === right.name &&
    left.personality === right.personality &&
    left.scenario === right.scenario &&
    left.systemPrompt === right.systemPrompt &&
    left.tagsText === right.tagsText
  );
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
  const [draftConcept, setDraftConcept] = useState('');
  const [avatarCopyState, setAvatarCopyState] = useState<AvatarCopyState>('idle');
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
  const setField = <K extends keyof CharacterFormState>(field: K, value: CharacterFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

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

  const generationAvailability = useGenerationAvailability();

  const draftMutation = useMutation({
    mutationFn: (concept: string) => {
      // Введённое имя закрепляем на сервере: он вернёт его без изменений,
      // а остальные поля сгенерирует заново.
      const pinnedName = form.name.trim();
      return generateCharacterDraft({
        concept,
        ...(pinnedName.length > 0 ? { fields: { name: pinnedName } } : {}),
      });
    },
    onSuccess: (draft) => {
      setForm((current) => ({
        ...current,
        description: draft.description,
        exampleDialogue: draft.exampleDialogue,
        firstMessage: draft.firstMessage,
        name: draft.name.trim().length > 0 ? draft.name : current.name,
        personality: draft.personality,
        scenario: draft.scenario,
        tagsText: draft.tags.join(', '),
      }));
    },
  });

  const fieldMutation = useMutation({
    mutationFn: (field: CharacterDraftFieldName) => {
      const concept = draftConcept.trim();
      return generateCharacterField({
        ...(concept.length > 0 ? { concept } : {}),
        current: toDraftFields(form),
        field,
      });
    },
    onSuccess: (response, field) => {
      setField(field, response.value);
    },
  });

  const avatarPromptMutation = useMutation({
    mutationFn: () => generateCharacterAvatarPrompt(toDraftFields(form)),
    onSuccess: () => {
      setAvatarCopyState('idle');
    },
  });

  const copyAvatarPrompt = async () => {
    const prompt = avatarPromptMutation.data?.prompt;
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setAvatarCopyState('copied');
    } catch {
      setAvatarCopyState('failed');
    }
  };

  const generationBusy = draftMutation.isPending || fieldMutation.isPending;
  const generationDisabled = !canEdit || saveMutation.isPending || generationBusy || generationAvailability.isBlocked;

  const fieldSparkleAction = (field: CharacterDraftFieldName, title: string) => (
    <button
      className="btn btn--xs"
      disabled={generationDisabled}
      onClick={() => {
        if (!generationBusy) {
          fieldMutation.mutate(field);
        }
      }}
      title={generationAvailability.blockReason ?? title}
      type="button"
    >
      <SparkleIcon size={12} />
      {fieldMutation.isPending && fieldMutation.variables === field ? ' Генерируем…' : null}
    </button>
  );

  const fieldErrorFor = (field: CharacterDraftFieldName) =>
    fieldMutation.isError && fieldMutation.variables === field ? (
      <div style={{ color: 'var(--danger)', fontSize: 'var(--fz-xs)' }}>
        {getApiErrorMessage(fieldMutation.error, 'Не удалось сгенерировать поле. Попробуйте ещё раз.')}
      </div>
    ) : null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) return;
    const trimmed = form.name.trim();
    if (!trimmed) return;
    saveMutation.mutate();
  };

  const errorMessage = saveMutation.error
    ? getApiErrorMessage(saveMutation.error, 'Не удалось сохранить персонажа.')
    : null;
  const deleteError = deleteMutation.error
    ? getApiErrorMessage(deleteMutation.error, 'Не удалось удалить персонажа.')
    : null;
  const draftGenerationError = draftMutation.error
    ? getApiErrorMessage(draftMutation.error, 'Не удалось сгенерировать карточку. Попробуйте ещё раз.')
    : null;
  const avatarPromptError = avatarPromptMutation.error
    ? getApiErrorMessage(avatarPromptMutation.error, 'Не удалось сгенерировать промпт для аватара.')
    : null;

  let sourceNote: ReactNode = null;
  if (detail?.source === 'png' && canEdit) {
    sourceNote = (
      <>
        Карточка хранится в формате PNG SillyTavern. Сохранение перезаписывает <code>chara</code>-чанк внутри файла —
        пиксели аватара не меняются.
      </>
    );
  } else if (!canEdit && detail) {
    sourceNote = 'Этот файл не похож на SillyTavern PNG — редактирование недоступно.';
  }

  let entityActions: ReactNode = null;
  if (!isNew && confirmDelete) {
    entityActions = (
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
    );
  } else if (!isNew) {
    entityActions = (
      <>
        <button
          className="btn btn--primary"
          disabled={startChatMutation.isPending || saveMutation.isPending || deleteMutation.isPending || isDirty}
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
    );
  }

  let submitLabel = isNew ? 'Создать' : 'Сохранить';
  if (saveMutation.isPending) {
    submitLabel = 'Сохраняем…';
  }

  let subtitle = 'Создаём JSON-карточку в data/characters/';
  if (!isNew) {
    if (detailQuery.isLoading) {
      subtitle = 'Загружаем карточку…';
    } else if (detail) {
      subtitle = `${detail.source.toUpperCase()} · сохранён ${formatRelative(detail.updatedAt)} · ${detail.id}`;
    } else {
      subtitle = 'Не удалось загрузить карточку';
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
              {submitLabel}
            </button>
          </>
        }
        crumbs={[
          { label: 'Персонажи', to: '/characters' },
          { label: isNew ? 'Новый персонаж' : (detail?.name ?? characterId ?? 'Персонаж'), strong: true },
        ]}
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">{isNew ? 'Новый персонаж' : (detail?.name ?? 'Загрузка…')}</h1>
              <div className="page__sub">{subtitle}</div>
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
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 300px',
                gap: 18,
                maxWidth: 1280,
                margin: '0 auto',
              }}
            >
              <form className="col gap-12" id="character-editor-form" onSubmit={handleSubmit}>
                <div className="card col gap-8" style={{ padding: 12 }}>
                  <Field
                    hint={
                      generationAvailability.blockReason ??
                      'Коротко опишите идею — модель заполнит карточку черновиком, сохранение остаётся за вами.'
                    }
                    id="character-draft-concept"
                    label="Концепт для генерации"
                  >
                    <div className="row gap-8">
                      <input
                        className="input"
                        disabled={!canEdit || draftMutation.isPending}
                        id="character-draft-concept"
                        maxLength={2000}
                        onChange={(event) => setDraftConcept(event.currentTarget.value)}
                        placeholder="Например: скромная керамистка из приморского городка"
                        style={{ flex: 1 }}
                        value={draftConcept}
                      />
                      <button
                        className="btn"
                        disabled={generationDisabled || draftConcept.trim().length === 0}
                        onClick={() => {
                          const concept = draftConcept.trim();
                          if (!generationBusy && concept.length > 0) {
                            draftMutation.mutate(concept);
                          }
                        }}
                        title={generationAvailability.blockReason ?? 'Сгенерировать карточку персонажа по концепту'}
                        type="button"
                      >
                        <SparkleIcon size={14} />{' '}
                        {draftMutation.isPending ? 'Генерируем…' : 'Сгенерировать по концепту'}
                      </button>
                    </div>
                  </Field>
                  {draftGenerationError ? (
                    <div style={{ color: 'var(--danger)', fontSize: 'var(--fz-xs)' }}>{draftGenerationError}</div>
                  ) : null}
                </div>
                <Field id="character-name" label="Имя" required>
                  <input
                    className="input"
                    disabled={!canEdit || saveMutation.isPending}
                    id="character-name"
                    maxLength={200}
                    onChange={(event) => setField('name', event.currentTarget.value)}
                    placeholder="Например: Эля"
                    value={form.name}
                  />
                </Field>
                <Field
                  action={fieldSparkleAction('description', 'Сгенерировать описание по текущей карточке')}
                  hint="Кто это, чем занимается, ключевые черты."
                  id="character-description"
                  label="Описание"
                >
                  <textarea
                    className="textarea"
                    disabled={!canEdit || saveMutation.isPending}
                    id="character-description"
                    maxLength={20_000}
                    onChange={(event) => setField('description', event.currentTarget.value)}
                    rows={6}
                    value={form.description}
                  />
                </Field>
                {fieldErrorFor('description')}
                <Field
                  action={fieldSparkleAction('personality', 'Сгенерировать личность по текущей карточке')}
                  hint="Темперамент, манера речи, реакции."
                  id="character-personality"
                  label="Личность"
                >
                  <textarea
                    className="textarea"
                    disabled={!canEdit || saveMutation.isPending}
                    id="character-personality"
                    maxLength={5_000}
                    onChange={(event) => setField('personality', event.currentTarget.value)}
                    rows={4}
                    value={form.personality}
                  />
                </Field>
                {fieldErrorFor('personality')}
                <Field
                  action={fieldSparkleAction('exampleDialogue', 'Сгенерировать примеры диалогов по текущей карточке')}
                  hint="Примеры реплик в формате SillyTavern — помогают модели держать стиль."
                  id="character-mes-example"
                  label="Примеры диалогов"
                >
                  <textarea
                    className="textarea"
                    disabled={!canEdit || saveMutation.isPending}
                    id="character-mes-example"
                    maxLength={20_000}
                    onChange={(event) => setField('exampleDialogue', event.currentTarget.value)}
                    rows={5}
                    value={form.exampleDialogue}
                  />
                </Field>
                {fieldErrorFor('exampleDialogue')}
                <Field hint="Через запятую." id="character-tags" label="Теги">
                  <input
                    className="input"
                    disabled={!canEdit || saveMutation.isPending}
                    id="character-tags"
                    onChange={(event) => setField('tagsText', event.currentTarget.value)}
                    placeholder="ru, slice-of-life, ремесло"
                    value={form.tagsText}
                  />
                </Field>
                <div className="divider" />
                <div>
                  <h3 style={{ margin: 0, fontSize: 'var(--fz-md)', fontWeight: 600 }}>Базовый сценарий</h3>
                  <div className="muted" style={{ fontSize: 'var(--fz-xs)', marginTop: 2 }}>
                    Сцена и приветствие по умолчанию. Если при создании чата выбран отдельный сценарий, он имеет
                    приоритет, а приветствие карточки не вставляется.
                  </div>
                </div>
                <Field
                  action={fieldSparkleAction('scenario', 'Сгенерировать сцену по текущей карточке')}
                  hint="Стартовая сцена, в которой персонаж находится по умолчанию."
                  id="character-scenario"
                  label="Сцена"
                >
                  <textarea
                    className="textarea"
                    disabled={!canEdit || saveMutation.isPending}
                    id="character-scenario"
                    maxLength={5_000}
                    onChange={(event) => setField('scenario', event.currentTarget.value)}
                    rows={3}
                    value={form.scenario}
                  />
                </Field>
                {fieldErrorFor('scenario')}
                <Field
                  action={fieldSparkleAction('firstMessage', 'Сгенерировать первую фразу по текущей карточке')}
                  hint="Вставляется как приветствие при создании чата без выбранного сценария."
                  id="character-first-mes"
                  label="Первая фраза"
                >
                  <textarea
                    className="textarea"
                    disabled={!canEdit || saveMutation.isPending}
                    id="character-first-mes"
                    maxLength={20_000}
                    onChange={(event) => setField('firstMessage', event.currentTarget.value)}
                    rows={4}
                    value={form.firstMessage}
                  />
                </Field>
                {fieldErrorFor('firstMessage')}
                <div className="divider" />
                <div>
                  <h3 style={{ margin: 0, fontSize: 'var(--fz-md)', fontWeight: 600 }}>Продвинутое</h3>
                  <div className="muted" style={{ fontSize: 'var(--fz-xs)', marginTop: 2 }}>
                    Стилевые мета-инструкции карточки — действуют во всех чатах с персонажем. Для разового
                    переопределения используйте настройки конкретного чата.
                  </div>
                </div>
                <Field
                  hint="Перекрывает глобальный шаблон system prompt. Приезжает с импортированными карточками SillyTavern."
                  id="character-system-prompt"
                  label="System Prompt (опционально)"
                >
                  <textarea
                    className="textarea"
                    disabled={!canEdit || saveMutation.isPending}
                    id="character-system-prompt"
                    maxLength={20_000}
                    onChange={(event) => setField('systemPrompt', event.currentTarget.value)}
                    rows={4}
                    value={form.systemPrompt}
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
                  <div className="col gap-8" style={{ marginTop: 10 }}>
                    <button
                      className="btn btn--xs"
                      disabled={avatarPromptMutation.isPending || generationAvailability.isBlocked}
                      onClick={() => {
                        if (!avatarPromptMutation.isPending) {
                          avatarPromptMutation.mutate();
                        }
                      }}
                      title={
                        generationAvailability.blockReason ??
                        'Сгенерировать промпт для Stable Diffusion по текущей карточке'
                      }
                      type="button"
                    >
                      <SparkleIcon size={12} /> {avatarPromptMutation.isPending ? 'Генерируем…' : 'Промпт для аватара'}
                    </button>
                    {avatarPromptMutation.data ? (
                      <>
                        <textarea
                          aria-label="Промпт для аватара"
                          className="textarea"
                          readOnly
                          rows={5}
                          style={{ fontSize: 'var(--fz-2xs)' }}
                          value={avatarPromptMutation.data.prompt}
                        />
                        <button className="btn btn--xs" onClick={() => void copyAvatarPrompt()} type="button">
                          <CopyIcon size={12} /> {AVATAR_COPY_LABELS[avatarCopyState]}
                        </button>
                      </>
                    ) : null}
                    {avatarPromptError ? (
                      <div style={{ color: 'var(--danger)', fontSize: 'var(--fz-2xs)' }}>{avatarPromptError}</div>
                    ) : null}
                  </div>
                </div>
                {sourceNote ? (
                  <div className="card" style={{ padding: 12 }}>
                    <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
                      {sourceNote}
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
