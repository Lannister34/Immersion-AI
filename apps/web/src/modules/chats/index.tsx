import type { ChatSummaryDto } from '@immersion/contracts/chats';
import type { ChatReplyPromptPreviewResponse } from '@immersion/contracts/generation';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Topbar } from '../../app/layout/topbar';
import { useUiShellStore } from '../../app/store/ui-shell';
import { ApiError, createApiUrl } from '../../shared/api/client';
import {
  BookIcon,
  BranchIcon,
  ChatIcon,
  ChevronRightIcon,
  CopyIcon,
  CpuIcon,
  DownloadIcon,
  EditIcon,
  EyeIcon,
  MoreIcon,
  PaperclipIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SendIcon,
  SlidersIcon,
  SortIcon,
  StopIcon,
  TrashIcon,
  UploadIcon,
  UserIcon,
  XIcon,
} from '../../shared/ui/icons';
import { characterListQueryOptions } from '../characters/queries/character-list-query';
import {
  chatReplyPromptPreviewQueryBaseKey,
  chatReplyPromptPreviewQueryOptions,
  generationReadinessQueryOptions,
  toGenerationAvailabilityViewModel,
  useChatReplyGeneration,
} from '../generation';
import { lorebookListQueryOptions } from '../lorebooks/queries/lorebook-list-query';
import { scenarioListQueryOptions } from '../scenarios/queries/scenario-list-query';
import { settingsOverviewQueryOptions } from '../settings';
import { createChat } from './api/create-chat';
import { useBranchChat } from './mutations/use-branch-chat';
import { useDeleteChat } from './mutations/use-delete-chat';
import { useDeleteChatMessage } from './mutations/use-delete-chat-message';
import { useUpdateChatBindings } from './mutations/use-update-chat-bindings';
import { useUpdateChatGenerationSettings } from './mutations/use-update-chat-generation-settings';
import { useUpdateChatLorebooks } from './mutations/use-update-chat-lorebooks';
import { useUpdateChatMessage } from './mutations/use-update-chat-message';
import { useUpdateChatTitle } from './mutations/use-update-chat-title';
import { chatListQueryKey, chatListQueryOptions } from './queries/chat-list-query';
import { chatSessionQueryOptions } from './queries/chat-session-query';

interface ChatSessionScreenProps {
  chatId: string;
}

function getGenerationErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  return 'Не удалось получить ответ модели. Проверьте API и повторите попытку.';
}

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `oklch(0.45 0.1 ${hue})`;
}

function avatarInitial(value: string | null | undefined): string {
  if (!value) {
    return '?';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '?';
  }
  return trimmed.slice(0, 1).toUpperCase();
}

function formatRelative(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24 && now.getDate() === date.getDate()) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffHr < 48) return 'вчера';
  const diffDays = Math.round(diffHr / 24);
  if (diffDays < 7) return `${diffDays} д`;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// ============================== Chat list ==============================

export function ChatListScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [characterFilter, setCharacterFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'updated' | 'name'>('updated');
  const deferredSearch = useDeferredValue(search);
  const chatListQuery = useQuery(chatListQueryOptions(deferredSearch));
  const createMutation = useMutation({
    mutationFn: createChat,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      await navigate({ to: '/chat/$chatId', params: { chatId: response.chat.id } });
    },
  });

  const allItems = chatListQuery.data?.items ?? [];

  const characterCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of allItems) {
      const key = item.characterName ?? 'Свободный';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).slice(0, 6);
  }, [allItems]);

  const filtered = useMemo(() => {
    const filteredItems = characterFilter
      ? allItems.filter((item) => (item.characterName ?? 'Свободный') === characterFilter)
      : allItems;
    const collator = new Intl.Collator('ru');
    return [...filteredItems].sort((left, right) => {
      if (sortMode === 'name') return collator.compare(left.title, right.title);
      return right.updatedAt.localeCompare(left.updatedAt);
    });
  }, [allItems, characterFilter, sortMode]);

  const lastUpdated = allItems[0]?.updatedAt;

  return (
    <main className="main">
      <Topbar
        crumbs={[{ label: 'Чаты', strong: true }]}
        actions={
          <>
            <button className="btn" type="button">
              <UploadIcon size={13} /> Импорт
            </button>
            <button
              className="btn btn--primary"
              disabled={createMutation.isPending}
              onClick={() => {
                createMutation.mutate({});
              }}
              type="button"
            >
              <PlusIcon size={13} /> Новый чат
            </button>
          </>
        }
        search={false}
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">Чаты</h1>
              <div className="page__sub">
                {chatListQuery.isLoading
                  ? 'Загружаем сессии…'
                  : `${allItems.length} чат${allItems.length === 1 ? '' : 'а'}` +
                    (lastUpdated ? ` · последняя активность ${formatRelative(lastUpdated)}` : '')}
              </div>
            </div>
            <div className="row gap-8">
              <div className="search" style={{ minWidth: 280 }}>
                <SearchIcon size={13} />
                <input
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  placeholder="Поиск по названию и тексту…"
                  value={search}
                />
              </div>
              <button
                className="btn btn--ghost-bordered"
                onClick={() => setSortMode((mode) => (mode === 'updated' ? 'name' : 'updated'))}
                type="button"
              >
                <SortIcon size={13} /> {sortMode === 'updated' ? 'Активность ↓' : 'По имени'}
              </button>
            </div>
          </div>
          {characterCounts.length > 0 ? (
            <div className="filters">
              <span
                className="filter-chip"
                data-active={characterFilter === null ? 'true' : 'false'}
                onClick={() => setCharacterFilter(null)}
                style={{ cursor: 'pointer' }}
              >
                Все
              </span>
              {characterCounts.map(([name, count]) => (
                <span
                  className="filter-chip"
                  data-active={characterFilter === name ? 'true' : 'false'}
                  key={name}
                  onClick={() => setCharacterFilter((current) => (current === name ? null : name))}
                  style={{ cursor: 'pointer' }}
                >
                  {name} <span className="dim">{count}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="page__body">
          {chatListQuery.isLoading ? (
            <ChatListSkeleton />
          ) : chatListQuery.isError ? (
            <div className="empty">
              <h2>Не удалось загрузить чаты</h2>
              <p>Проверьте rewrite API и повторите попытку.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <h2>{allItems.length === 0 ? 'Пока нет ни одного чата' : 'Ничего не найдено'}</h2>
              <p>
                {allItems.length === 0
                  ? 'Запустите свободный чат или начните разговор с готовым персонажем или сценарием.'
                  : 'Попробуйте изменить запрос или сбросить фильтры.'}
              </p>
              {allItems.length === 0 ? (
                <div className="row gap-8" style={{ marginTop: 12, justifyContent: 'center' }}>
                  <button
                    className="btn btn--primary"
                    disabled={createMutation.isPending}
                    onClick={() => createMutation.mutate({})}
                    type="button"
                  >
                    <PlusIcon size={13} /> Свободный чат
                  </button>
                  <Link className="btn" to="/characters">
                    Выбрать персонажа
                  </Link>
                  <Link className="btn" to="/scenarios">
                    Выбрать сценарий
                  </Link>
                </div>
              ) : null}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gap: 1,
                background: 'var(--hairline)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--r-md)',
                overflow: 'hidden',
              }}
            >
              {filtered.map((chat) => (
                <ChatListRow chat={chat} key={chat.id} />
              ))}
            </div>
          )}
          {createMutation.isError ? (
            <div className="empty" style={{ marginTop: 16 }}>
              <p>Не удалось создать чат. Проверьте rewrite API и попробуйте ещё раз.</p>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

interface ChatListRowProps {
  chat: ChatSummaryDto;
}

function ChatListRow({ chat }: ChatListRowProps) {
  const displayName = chat.characterName ?? chat.title;
  const subline = chat.characterName ? chat.title : 'свободный чат';
  const preview = chat.lastMessagePreview ?? 'Сообщений пока нет.';
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteMutation = useDeleteChat(chat.id);

  const handleDeleteClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setConfirmDelete(true);
  };
  const handleConfirm = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    deleteMutation.mutate(undefined, {
      onSettled: () => setConfirmDelete(false),
    });
  };
  const handleCancel = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setConfirmDelete(false);
  };

  return (
    <Link
      params={{ chatId: chat.id }}
      style={{
        display: 'grid',
        gridTemplateColumns: '40px minmax(0, 1.2fr) minmax(0, 2fr) 100px minmax(80px, max-content)',
        gap: 14,
        alignItems: 'center',
        padding: '12px 14px',
        background: 'var(--bg)',
        cursor: 'pointer',
        color: 'inherit',
        textDecoration: 'none',
      }}
      to="/chat/$chatId"
    >
      <div
        className="avatar avatar--36"
        style={
          chat.characterAvatarUrl
            ? {
                background: `center / cover no-repeat url("${createApiUrl(chat.characterAvatarUrl)}")`,
                border: 0,
              }
            : { background: avatarColor(displayName), color: 'white', border: 0 }
        }
      >
        {chat.characterAvatarUrl ? null : avatarInitial(displayName)}
      </div>
      <div style={{ minWidth: 0 }}>
        <strong className="truncate" style={{ display: 'block', fontSize: 'var(--fz-md)' }}>
          {displayName}
        </strong>
        <div className="muted truncate mt-4" style={{ fontSize: 'var(--fz-xs)' }}>
          {subline}
        </div>
      </div>
      <div className="muted truncate" style={{ fontSize: 'var(--fz-sm)' }}>
        {preview}
      </div>
      <div className="muted mono tnum" style={{ fontSize: 'var(--fz-xs)' }}>
        {formatRelative(chat.updatedAt)}
      </div>
      <div className="row gap-4" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
        {confirmDelete ? (
          <>
            <button
              className="btn btn--xs btn--danger"
              disabled={deleteMutation.isPending}
              onClick={handleConfirm}
              type="button"
            >
              Удалить
            </button>
            <button
              className="btn btn--xs btn--icon"
              disabled={deleteMutation.isPending}
              onClick={handleCancel}
              title="Отменить"
              type="button"
            >
              <XIcon size={12} />
            </button>
          </>
        ) : (
          <>
            <span className="tag mono tnum">{chat.messageCount}</span>
            <button className="btn btn--icon btn--xs" onClick={handleDeleteClick} title="Удалить чат" type="button">
              <TrashIcon size={12} />
            </button>
          </>
        )}
      </div>
    </Link>
  );
}

function ChatListSkeleton() {
  return (
    <div
      style={{
        display: 'grid',
        gap: 1,
        background: 'var(--hairline)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '40px minmax(0, 1.2fr) minmax(0, 2fr) 100px 80px',
            gap: 14,
            alignItems: 'center',
            padding: '12px 14px',
            background: 'var(--bg)',
          }}
        >
          <div className="avatar avatar--36" style={{ opacity: 0.4 }} />
          <div className="col" style={{ gap: 6 }}>
            <div style={{ height: 10, width: '40%', background: 'var(--surface-2)', borderRadius: 4 }} />
            <div style={{ height: 8, width: '70%', background: 'var(--surface-2)', borderRadius: 4 }} />
          </div>
          <div style={{ height: 10, width: '90%', background: 'var(--surface-2)', borderRadius: 4 }} />
          <div style={{ height: 10, width: 50, background: 'var(--surface-2)', borderRadius: 4, marginLeft: 'auto' }} />
          <div />
        </div>
      ))}
    </div>
  );
}

// ============================== Chat session ==============================

type RightPanelSection = 'settings' | 'character' | 'lorebooks' | 'context' | null;

export function ChatSessionScreen({ chatId }: ChatSessionScreenProps) {
  const [draftMessage, setDraftMessage] = useState('');
  const deferredDraftMessage = useDeferredValue(draftMessage);
  const openSection = useUiShellStore((state) => state.chatRightPanelSection);
  const setOpenSection = useUiShellStore((state) => state.setChatRightPanelSection);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const chatSessionQuery = useQuery(chatSessionQueryOptions(chatId));
  const generationReadinessQuery = useQuery(generationReadinessQueryOptions());
  const promptPreviewQuery = useQuery(chatReplyPromptPreviewQueryOptions(chatId, deferredDraftMessage));
  const settingsOverviewQuery = useQuery(settingsOverviewQueryOptions());
  const updateGenerationSettingsMutation = useUpdateChatGenerationSettings(chatId, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: chatReplyPromptPreviewQueryBaseKey(chatId),
      });
    },
  });
  const updateMessageMutation = useUpdateChatMessage(chatId);
  const deleteMessageMutation = useDeleteChatMessage(chatId);
  const branchChatMutation = useBranchChat(chatId, {
    onSuccess: async (response) => {
      await navigate({ to: '/chat/$chatId', params: { chatId: response.chat.id } });
    },
  });
  const deleteChatMutation = useDeleteChat(chatId, {
    onSuccess: async () => {
      await navigate({ to: '/chat' });
    },
  });
  const [confirmDeleteChat, setConfirmDeleteChat] = useState(false);
  const [renamingTitle, setRenamingTitle] = useState<string | null>(null);
  const renameChatMutation = useUpdateChatTitle(chatId, {
    onSuccess: () => {
      setRenamingTitle(null);
    },
  });
  const chatReplyGeneration = useChatReplyGeneration(chatId);

  const transcriptRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatSessionQuery.data?.messages.length]);

  if (chatSessionQuery.isLoading) {
    return (
      <main className="main">
        <Topbar crumbs={[{ label: 'Чаты' }, { label: 'Загрузка…', strong: true }]} search={false} />
        <div className="empty" style={{ padding: 80 }}>
          <h2>Загрузка чата</h2>
          <p>Получаем сохранённую сессию из backend.</p>
        </div>
      </main>
    );
  }

  if (chatSessionQuery.isError || !chatSessionQuery.data) {
    return (
      <main className="main">
        <Topbar crumbs={[{ label: 'Чаты' }, { label: 'Чат не найден', strong: true }]} search={false} />
        <div className="empty" style={{ padding: 80 }}>
          <h2>Не удалось открыть чат</h2>
          <p>Чат не найден или backend не смог прочитать его файл.</p>
        </div>
      </main>
    );
  }

  const session = chatSessionQuery.data;
  const generationAvailability = toGenerationAvailabilityViewModel({
    isError: generationReadinessQuery.isError,
    isLoading: generationReadinessQuery.isLoading,
    readiness: generationReadinessQuery.data,
  });
  const jobErrorMessage =
    chatReplyGeneration.latestJob?.status === 'failed' ? chatReplyGeneration.latestJob.error?.message : undefined;
  const generationErrorMessage = chatReplyGeneration.error
    ? getGenerationErrorMessage(chatReplyGeneration.error)
    : jobErrorMessage;

  const blockReason = generationAvailability.blockReason;
  const isStreaming = Boolean(chatReplyGeneration.activeJob);
  const canSend = draftMessage.trim().length > 0 && !chatReplyGeneration.isPending && !blockReason;

  const onSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    const message = draftMessage;
    setDraftMessage('');
    try {
      await chatReplyGeneration.start(message);
    } catch {
      setDraftMessage(message);
    }
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void onSubmit();
    }
  };

  const characterDisplay = session.characterName ?? 'Свободный чат';
  const messageCount = session.messages.length;
  const lastUpdated = session.chat.updatedAt;
  const tokenStats = toContextStats(promptPreviewQuery.data);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 320px',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <main className="main">
        <Topbar
          crumbs={[{ label: 'Чаты' }, { label: `${characterDisplay} · ${session.chat.title}`, strong: true }]}
          actions={
            <>
              <a
                className="btn"
                download
                href={createApiUrl(`/api/chats/${encodeURIComponent(chatId)}/export`)}
                title="Скачать JSONL-снимок чата"
              >
                <DownloadIcon size={14} /> Экспорт
              </a>
              {confirmDeleteChat ? (
                <>
                  <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
                    удалить весь чат?
                  </span>
                  <button
                    className="btn btn--danger"
                    disabled={deleteChatMutation.isPending}
                    onClick={() => deleteChatMutation.mutate()}
                    type="button"
                  >
                    Да, удалить
                  </button>
                  <button
                    className="btn"
                    disabled={deleteChatMutation.isPending}
                    onClick={() => setConfirmDeleteChat(false)}
                    type="button"
                  >
                    Отменить
                  </button>
                </>
              ) : (
                <button className="btn" onClick={() => setConfirmDeleteChat(true)} title="Удалить чат" type="button">
                  <TrashIcon size={14} /> Удалить
                </button>
              )}
              <button className="btn btn--icon" type="button">
                <MoreIcon size={14} />
              </button>
            </>
          }
          search={false}
        />
        <div
          style={{
            display: 'grid',
            gridTemplateRows: 'auto minmax(0, 1fr) auto',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 22px',
              borderBottom: '1px solid var(--hairline)',
            }}
          >
            <div
              className="avatar avatar--36"
              style={
                session.characterAvatarUrl
                  ? {
                      background: `center / cover no-repeat url("${createApiUrl(session.characterAvatarUrl)}")`,
                      border: 0,
                    }
                  : { background: avatarColor(characterDisplay), color: 'white', border: 0 }
              }
            >
              {session.characterAvatarUrl ? null : avatarInitial(characterDisplay)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--fz-md)' }}>{characterDisplay}</div>
              <div className="muted row gap-6" style={{ fontSize: 'var(--fz-xs)', alignItems: 'center' }}>
                {renamingTitle !== null ? (
                  <input
                    autoFocus
                    className="input"
                    disabled={renameChatMutation.isPending}
                    onBlur={() => {
                      const value = renamingTitle.trim();
                      if (value.length > 0 && value !== session.chat.title) {
                        renameChatMutation.mutate({ title: value });
                      } else {
                        setRenamingTitle(null);
                      }
                    }}
                    onChange={(event) => setRenamingTitle(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        const value = renamingTitle.trim();
                        if (value.length > 0 && value !== session.chat.title) {
                          renameChatMutation.mutate({ title: value });
                        } else {
                          setRenamingTitle(null);
                        }
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        setRenamingTitle(null);
                      }
                    }}
                    style={{ height: 24, padding: '2px 6px', fontSize: 'var(--fz-xs)', maxWidth: 320 }}
                    value={renamingTitle}
                  />
                ) : (
                  <button
                    onClick={() => setRenamingTitle(session.chat.title)}
                    style={{
                      background: 'transparent',
                      border: 0,
                      color: 'inherit',
                      cursor: 'text',
                      font: 'inherit',
                      padding: 0,
                      textAlign: 'left',
                    }}
                    title="Переименовать чат"
                    type="button"
                  >
                    {session.chat.title}
                  </button>
                )}
                <span>
                  · {messageCount} сообщ. · ред. {formatRelative(lastUpdated)}
                </span>
              </div>
            </div>
            {tokenStats ? (
              <div className="row gap-12" style={{ minWidth: 240 }}>
                <TokenBar
                  fill={tokenStats.totalTokens}
                  label={`${tokenStats.totalTokens.toLocaleString('ru-RU')} / ${tokenStats.contextWindow.toLocaleString('ru-RU')}`}
                  total={tokenStats.contextWindow}
                />
              </div>
            ) : null}
          </div>
          <div ref={transcriptRef} style={{ overflow: 'auto', padding: '18px 22px', background: 'var(--bg)' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                maxWidth: 780,
                margin: '0 auto',
              }}
            >
              {session.messages.length === 0 ? (
                <div className="empty">
                  <h2>В этом чате пока нет сообщений</h2>
                  <p>
                    {session.characterName
                      ? `Напишите ${session.characterName} первое сообщение — модель ответит в роли персонажа.`
                      : 'Свободный чат: модель отвечает без привязки к персонажу или сценарию.'}
                  </p>
                </div>
              ) : (
                (() => {
                  const lastAssistantId = [...session.messages].reverse().find((m) => m.role === 'assistant')?.id;
                  const baseTitle = session.chat.title.trim();
                  const defaultBranchTitle = baseTitle.endsWith(' (ветка)')
                    ? baseTitle
                    : `${baseTitle || 'Новая ветка'} (ветка)`;
                  return session.messages.map((message, index) => {
                    const messageIndex = index + 1;
                    const isLastAssistant = message.id === lastAssistantId;
                    const isMutating =
                      updateMessageMutation.isPending ||
                      deleteMessageMutation.isPending ||
                      branchChatMutation.isPending ||
                      isStreaming;
                    return (
                      <BubbleMessage
                        branchTitleDefault={defaultBranchTitle}
                        canRegenerate={isLastAssistant && !isMutating}
                        characterAvatarUrl={session.characterAvatarUrl}
                        chatId={chatId}
                        isMutating={isMutating}
                        isSystem={message.role === 'system'}
                        isUser={message.role === 'user'}
                        key={message.id}
                        messageIndex={messageIndex}
                        onBranch={async (title) => {
                          await branchChatMutation.mutateAsync({
                            throughMessageIndex: messageIndex,
                            ...(title ? { title } : {}),
                          });
                        }}
                        onDelete={async () => {
                          await deleteMessageMutation.mutateAsync({ messageIndex });
                        }}
                        onRegenerate={async () => {
                          try {
                            await chatReplyGeneration.regenerate();
                          } catch {
                            // surface via generationErrorMessage
                          }
                        }}
                        onSave={async (content) => {
                          await updateMessageMutation.mutateAsync({
                            command: { content },
                            messageIndex,
                          });
                        }}
                        text={message.content}
                        time={formatTime(message.createdAt)}
                        who={message.role === 'user' ? session.userName : characterDisplay}
                      />
                    );
                  });
                })()
              )}
              {isStreaming ? (
                <div
                  className="muted"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    justifyContent: 'center',
                    marginTop: 4,
                    fontSize: 'var(--fz-xs)',
                  }}
                >
                  <span className="dot" style={{ width: 6, height: 6, background: 'var(--accent)' }} />
                  {characterDisplay} печатает…
                </div>
              ) : null}
            </div>
          </div>
          <div
            style={{
              padding: '12px 22px 16px',
              borderTop: '1px solid var(--hairline)',
              background: 'var(--bg)',
            }}
          >
            <div style={{ maxWidth: 780, margin: '0 auto' }}>
              {generationErrorMessage ? (
                <div
                  className="card"
                  style={{
                    padding: '8px 12px',
                    marginBottom: 8,
                    color: 'var(--danger)',
                    background: 'var(--danger-soft)',
                    borderColor: 'transparent',
                    fontSize: 'var(--fz-sm)',
                  }}
                >
                  {generationErrorMessage}
                </div>
              ) : null}
              <Composer
                blockReason={blockReason}
                canSend={canSend}
                isStreaming={isStreaming}
                onCancel={chatReplyGeneration.cancel}
                onChange={(event) => setDraftMessage(event.currentTarget.value)}
                onKeyDown={onComposerKeyDown}
                onSubmit={onSubmit}
                value={draftMessage}
              />
            </div>
          </div>
        </div>
      </main>
      <RightPanel
        characterAvatarUrl={session.characterAvatarUrl}
        characterId={session.characterId}
        characterName={session.characterName}
        chatId={chatId}
        contextStats={tokenStats}
        lorebookIds={session.lorebookIds}
        onSectionToggle={(id) => setOpenSection(openSection === id ? null : id)}
        openSection={openSection}
        samplerPresetId={session.generationSettings.samplerPresetId}
        sampling={session.generationSettings.sampling}
        scenarioId={session.scenarioId}
        scenarioName={session.scenarioName}
        settingsOverview={settingsOverviewQuery.data}
      />
    </div>
  );
}

interface BubbleMessageProps {
  branchTitleDefault: string;
  canRegenerate: boolean;
  characterAvatarUrl: string | null;
  chatId: string;
  isMutating: boolean;
  isSystem: boolean;
  isUser: boolean;
  messageIndex: number;
  onBranch: (title?: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onRegenerate: () => Promise<void>;
  onSave: (content: string) => Promise<void>;
  text: string;
  time: string;
  who: string;
}

function BubbleMessage({
  branchTitleDefault,
  canRegenerate,
  characterAvatarUrl,
  chatId,
  isMutating,
  isSystem,
  isUser,
  messageIndex,
  onBranch,
  onDelete,
  onRegenerate,
  onSave,
  text,
  time,
  who,
}: BubbleMessageProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [draft, setDraft] = useState(text);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [branchDraft, setBranchDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const deferredDraft = useDeferredValue(draft);
  const trimmedDraft = deferredDraft.trim();
  const editPreviewQuery = useQuery({
    ...chatReplyPromptPreviewQueryOptions(chatId, undefined, [{ content: trimmedDraft, messageIndex }]),
    enabled: mode === 'edit' && trimmedDraft.length > 0 && trimmedDraft !== text,
  });
  const editPreviewStats = mode === 'edit' ? toContextStats(editPreviewQuery.data) : undefined;

  useEffect(() => {
    if (mode === 'view') {
      setDraft(text);
    }
  }, [mode, text]);

  if (isSystem) {
    return <div className="bubble--system bubble">{text}</div>;
  }

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === text) {
      setMode('view');
      return;
    }
    setBusy(true);
    try {
      await onSave(trimmed);
      setMode('view');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    setDraft(text);
    setMode('view');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore — clipboard restrictions
    }
  };

  const handleConfirmDelete = async () => {
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const handleRegenerate = async () => {
    setBusy(true);
    try {
      await onRegenerate();
    } finally {
      setBusy(false);
    }
  };

  const handleBranchOpen = () => {
    setBranchDraft(branchTitleDefault);
  };

  const handleBranchCancel = () => {
    setBranchDraft(null);
  };

  const handleBranchSubmit = async () => {
    const title = (branchDraft ?? '').trim();
    setBusy(true);
    try {
      await onBranch(title.length > 0 ? title : undefined);
      setBranchDraft(null);
    } finally {
      setBusy(false);
    }
  };

  const isActionsPinned = mode === 'edit' || confirmDelete || branchDraft !== null;

  return (
    <div
      className="bubble-row"
      data-actions={isActionsPinned ? 'pinned' : 'auto'}
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}
    >
      <div
        className="avatar avatar--36"
        style={
          isUser
            ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
            : characterAvatarUrl
              ? { background: `center / cover no-repeat url("${createApiUrl(characterAvatarUrl)}")`, border: 0 }
              : { background: avatarColor(who), color: 'white', border: 0 }
        }
      >
        {isUser || !characterAvatarUrl ? avatarInitial(who) : null}
      </div>
      <div style={{ maxWidth: 'min(620px, 80%)', display: 'grid', gap: 4 }}>
        <div
          className="row gap-8"
          style={{
            justifyContent: isUser ? 'flex-end' : 'flex-start',
            fontSize: 'var(--fz-xs)',
            color: 'var(--muted)',
          }}
        >
          <strong style={{ color: 'var(--text)' }}>{who}</strong>
          <span className="mono">{time}</span>
        </div>
        {mode === 'edit' ? (
          <div className={isUser ? 'bubble bubble--user' : 'bubble'} style={{ display: 'grid', gap: 8, padding: 10 }}>
            <textarea
              autoFocus
              className="textarea"
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  handleCancel();
                } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  void handleSave();
                }
              }}
              style={{ minHeight: 80, background: 'transparent', border: '1px solid var(--hairline)' }}
              value={draft}
            />
            <div className="row gap-6" style={{ alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span className="muted" style={{ fontSize: 'var(--fz-2xs)', marginRight: 'auto' }}>
                <span className="kbd">Ctrl</span>+<span className="kbd">Enter</span> сохранить ·{' '}
                <span className="kbd">Esc</span> отменить
              </span>
              <span className="muted mono" style={{ fontSize: 'var(--fz-2xs)' }} title="Длина черновика в символах">
                {draft.length.toLocaleString('ru-RU')} симв.
              </span>
              {editPreviewStats ? (
                <span
                  className="muted mono"
                  style={{ fontSize: 'var(--fz-2xs)' }}
                  title="Оценка контекста после применения правки"
                >
                  ≈ {editPreviewStats.totalTokens.toLocaleString('ru-RU')} /{' '}
                  {editPreviewStats.contextWindow.toLocaleString('ru-RU')} ток.
                </span>
              ) : null}
              {editPreviewQuery.isFetching ? (
                <span className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
                  пересчёт…
                </span>
              ) : null}
              <button className="btn btn--xs btn--ghost-bordered" disabled={busy} onClick={handleCancel} type="button">
                Отменить
              </button>
              <button
                className="btn btn--xs btn--primary"
                disabled={busy || draft.trim().length === 0}
                onClick={() => void handleSave()}
                type="button"
              >
                Сохранить
              </button>
            </div>
          </div>
        ) : (
          <div className={isUser ? 'bubble bubble--user' : 'bubble'}>{text}</div>
        )}
        {mode === 'view' ? (
          <div className="row gap-4 bubble-row__actions" style={{ justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
            {canRegenerate ? (
              <button
                className="btn btn--xs"
                disabled={isMutating || busy}
                onClick={() => void handleRegenerate()}
                title="Перегенерировать"
                type="button"
              >
                <RefreshIcon size={12} />
              </button>
            ) : null}
            <button className="btn btn--xs" onClick={() => void handleCopy()} title="Копировать" type="button">
              <CopyIcon size={12} />
            </button>
            <button
              className="btn btn--xs"
              disabled={isMutating || busy}
              onClick={() => setMode('edit')}
              title="Редактировать"
              type="button"
            >
              <EditIcon size={12} />
            </button>
            {confirmDelete ? (
              <>
                <span className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
                  удалить это и все следующие?
                </span>
                <button
                  className="btn btn--xs btn--danger"
                  disabled={busy}
                  onClick={() => void handleConfirmDelete()}
                  type="button"
                >
                  Да
                </button>
                <button className="btn btn--xs" disabled={busy} onClick={() => setConfirmDelete(false)} type="button">
                  Нет
                </button>
              </>
            ) : (
              <button
                className="btn btn--xs"
                disabled={isMutating || busy}
                onClick={() => setConfirmDelete(true)}
                title="Удалить (и все последующие)"
                type="button"
              >
                <TrashIcon size={12} />
              </button>
            )}
            {branchDraft !== null ? (
              <>
                <input
                  autoFocus
                  className="input"
                  onChange={(event) => setBranchDraft(event.currentTarget.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      handleBranchCancel();
                    } else if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleBranchSubmit();
                    }
                  }}
                  placeholder="Название ветки"
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--hairline)',
                    borderRadius: 4,
                    fontSize: 'var(--fz-2xs)',
                    minWidth: 180,
                    padding: '2px 6px',
                  }}
                  value={branchDraft}
                />
                <button
                  className="btn btn--xs btn--primary"
                  disabled={busy}
                  onClick={() => void handleBranchSubmit()}
                  title="Создать ветку"
                  type="button"
                >
                  Создать
                </button>
                <button
                  className="btn btn--xs"
                  disabled={busy}
                  onClick={handleBranchCancel}
                  title="Отменить"
                  type="button"
                >
                  Отменить
                </button>
              </>
            ) : (
              <button
                className="btn btn--xs"
                disabled={isMutating || busy}
                onClick={handleBranchOpen}
                title="Разветвить с этой реплики"
                type="button"
              >
                <BranchIcon size={12} />
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface ComposerProps {
  blockReason?: string | undefined;
  canSend: boolean;
  isStreaming: boolean;
  onCancel: () => void;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event?: FormEvent) => void;
  value: string;
}

function Composer({
  blockReason,
  canSend,
  isStreaming,
  onCancel,
  onChange,
  onKeyDown,
  onSubmit,
  value,
}: ComposerProps) {
  const tokens = value.length;
  return (
    <form
      className="card"
      onSubmit={onSubmit}
      style={{ padding: '10px 12px', display: 'grid', gap: 8, background: 'var(--surface)' }}
    >
      <textarea
        className="textarea"
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={blockReason ?? 'Напишите сообщение…'}
        style={{ minHeight: 48, border: 0, background: 'transparent', padding: 0, resize: 'none' }}
        value={value}
      />
      <div className="between">
        <div className="row gap-4">
          <button className="btn btn--icon" title="Прикрепить" type="button">
            <PaperclipIcon size={14} />
          </button>
          <button className="btn btn--icon" title="Лорбук" type="button">
            <BookIcon size={14} />
          </button>
          <button className="btn btn--icon" title="Модель" type="button">
            <CpuIcon size={14} />
          </button>
          <button className="btn btn--icon" title="Настройки" type="button">
            <SlidersIcon size={14} />
          </button>
          <span className="muted mono" style={{ fontSize: 'var(--fz-xs)' }}>
            {tokens.toLocaleString('ru-RU')} / 4096
          </span>
        </div>
        <div className="row gap-8">
          <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
            <span className="kbd">Enter</span> отправить
          </span>
          {isStreaming ? (
            <button className="btn btn--ghost-bordered" onClick={onCancel} type="button">
              <StopIcon size={14} /> Остановить
            </button>
          ) : (
            <button className="btn btn--primary" disabled={!canSend} type="submit">
              <SendIcon size={14} /> Отправить
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

interface ContextStats {
  totalTokens: number;
  contextWindow: number;
  messageCount: number;
  systemTokens: number;
  transcriptTokens: number;
  presetName?: string;
  modelName?: string | null;
}

function toContextStats(preview: ChatReplyPromptPreviewResponse | undefined): ContextStats | undefined {
  if (!preview) return undefined;
  const { tokenEstimate, transcriptMessageCount } = preview.diagnostics;
  return {
    totalTokens: tokenEstimate.finalTotal,
    contextWindow: preview.effectiveSettings.sampling.maxContextLength,
    messageCount: transcriptMessageCount,
    systemTokens: tokenEstimate.system,
    transcriptTokens: tokenEstimate.transcriptAfterTrim,
    presetName: preview.effectiveSettings.samplerPresetName,
    modelName: preview.effectiveSettings.modelName,
  };
}

interface RightPanelProps {
  characterAvatarUrl: string | null;
  characterId: string | null;
  characterName: string | null;
  chatId: string;
  contextStats?: ContextStats | undefined;
  lorebookIds: string[];
  onSectionToggle: (section: RightPanelSection) => void;
  openSection: RightPanelSection;
  samplerPresetId: string | null;
  sampling: Record<string, number | string | null>;
  scenarioId: string | null;
  scenarioName: string | null;
  settingsOverview?: SettingsOverviewResponse | undefined;
}

function RightPanel({
  characterAvatarUrl,
  characterId,
  characterName,
  chatId,
  contextStats,
  lorebookIds,
  onSectionToggle,
  openSection,
  samplerPresetId,
  sampling,
  scenarioId,
  scenarioName,
  settingsOverview,
}: RightPanelProps) {
  const sections: { id: NonNullable<RightPanelSection>; label: string; icon: ReactNode }[] = [
    { id: 'settings', label: 'Настройки генерации', icon: <SlidersIcon size={13} stroke="var(--muted)" /> },
    { id: 'character', label: 'Персонаж и сценарий', icon: <UserIcon size={13} stroke="var(--muted)" /> },
    { id: 'lorebooks', label: 'Лорбуки', icon: <BookIcon size={13} stroke="var(--muted)" /> },
    { id: 'context', label: 'Превью контекста', icon: <EyeIcon size={13} stroke="var(--muted)" /> },
  ];

  return (
    <aside className="rp">
      <div className="rp__head">
        <strong style={{ fontSize: 'var(--fz-md)' }}>Контекст чата</strong>
        <button className="btn btn--icon" type="button">
          <XIcon size={14} />
        </button>
      </div>
      <div className="rp__body">
        {sections.map((section) => {
          const isOpen = openSection === section.id;
          return (
            <div className="rp__section" data-open={isOpen ? 'true' : 'false'} key={section.id}>
              <button className="rp__section-toggle" onClick={() => onSectionToggle(section.id)} type="button">
                {section.icon}
                <span style={{ flex: 1, textAlign: 'left' }}>{section.label}</span>
                <ChevronRightIcon className="chevron" size={12} />
              </button>
              {isOpen ? (
                <div className="rp__section-body">
                  {section.id === 'settings' ? (
                    <SettingsSectionContent
                      samplerPresetId={samplerPresetId}
                      sampling={sampling}
                      settings={settingsOverview}
                    />
                  ) : section.id === 'character' ? (
                    <CharacterSectionContent
                      chatId={chatId}
                      characterAvatarUrl={characterAvatarUrl}
                      characterId={characterId}
                      characterName={characterName}
                      scenarioId={scenarioId}
                      scenarioName={scenarioName}
                    />
                  ) : section.id === 'lorebooks' ? (
                    <LorebooksSectionContent chatId={chatId} lorebookIds={lorebookIds} />
                  ) : (
                    <ContextSectionContent stats={contextStats} />
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

interface LorebooksSectionContentProps {
  chatId: string;
  lorebookIds: string[];
}

function LorebooksSectionContent({ chatId, lorebookIds }: LorebooksSectionContentProps) {
  const query = useQuery(lorebookListQueryOptions());
  const mutation = useUpdateChatLorebooks(chatId);
  const items = query.data?.items ?? [];
  const selected = new Set(lorebookIds);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    mutation.mutate(Array.from(next));
  };

  if (query.isLoading) {
    return (
      <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
        Загружаем…
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
        Не удалось загрузить лорбуки.
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
        Лорбуков пока нет — добавьте JSON-файлы в <code>data/worlds/</code>.
      </div>
    );
  }

  return (
    <div className="col gap-6">
      <div className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
        Подключённые лорбуки добавляются в системный prompt, когда в последних сообщениях встречаются их ключевые слова.
      </div>
      {items.map((lorebook) => {
        const isOn = selected.has(lorebook.id);
        return (
          <label
            className="row gap-8"
            key={lorebook.id}
            style={{ alignItems: 'center', cursor: 'pointer', fontSize: 'var(--fz-sm)', padding: '4px 0' }}
          >
            <input checked={isOn} disabled={mutation.isPending} onChange={() => toggle(lorebook.id)} type="checkbox" />
            <span style={{ flex: 1, minWidth: 0 }} className="truncate">
              {lorebook.name}
            </span>
            <span className="muted mono tnum" style={{ fontSize: 'var(--fz-2xs)' }}>
              {lorebook.entryCount}
            </span>
          </label>
        );
      })}
      {mutation.error ? (
        <div className="muted" style={{ color: 'var(--danger)', fontSize: 'var(--fz-2xs)' }}>
          Не удалось сохранить выбор.
        </div>
      ) : null}
    </div>
  );
}

interface SettingsSectionContentProps {
  samplerPresetId: string | null;
  sampling: Record<string, number | string | null>;
  settings?: SettingsOverviewResponse | undefined;
}

function SettingsSectionContent({ samplerPresetId, sampling, settings }: SettingsSectionContentProps) {
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

function CharacterSectionContent({
  chatId,
  characterAvatarUrl,
  characterId,
  characterName,
  scenarioId,
  scenarioName,
}: {
  chatId: string;
  characterAvatarUrl: string | null;
  characterId: string | null;
  characterName: string | null;
  scenarioId: string | null;
  scenarioName: string | null;
}) {
  const [editingCharacter, setEditingCharacter] = useState(false);
  const [editingScenario, setEditingScenario] = useState(false);
  const characterListQuery = useQuery(characterListQueryOptions());
  const scenarioListQuery = useQuery(scenarioListQueryOptions());
  const bindingsMutation = useUpdateChatBindings(chatId, {
    onSuccess: () => {
      setEditingCharacter(false);
      setEditingScenario(false);
    },
  });

  const applyCharacter = (nextId: string | null) => {
    bindingsMutation.mutate({ characterId: nextId });
  };
  const applyScenario = (nextId: string | null) => {
    bindingsMutation.mutate({ scenarioId: nextId });
  };

  const mutationError = bindingsMutation.error
    ? bindingsMutation.error instanceof ApiError
      ? bindingsMutation.error.message
      : 'Не удалось обновить привязку.'
    : null;

  return (
    <div className="col gap-10">
      {characterId && characterName ? (
        <div className="row gap-10">
          <div
            className="avatar avatar--36"
            style={
              characterAvatarUrl
                ? {
                    background: `center / cover no-repeat url("${createApiUrl(characterAvatarUrl)}")`,
                    border: 0,
                  }
                : { background: avatarColor(characterName), color: 'white', border: 0 }
            }
          >
            {characterAvatarUrl ? null : avatarInitial(characterName)}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{characterName}</div>
            <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
              привязан к чату
            </div>
          </div>
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
          Персонаж не привязан — свободный чат.
        </div>
      )}
      <div className="row gap-6" style={{ flexWrap: 'wrap' }}>
        {characterId ? (
          <Link className="btn btn--xs" params={{ characterId }} to="/characters/$characterId">
            Открыть карточку
          </Link>
        ) : null}
        <button
          className="btn btn--xs btn--ghost-bordered"
          disabled={bindingsMutation.isPending}
          onClick={() => setEditingCharacter((current) => !current)}
          type="button"
        >
          {editingCharacter ? 'Скрыть' : characterId ? 'Сменить персонажа' : 'Выбрать персонажа'}
        </button>
        {characterId ? (
          <button
            className="btn btn--xs btn--ghost-bordered"
            disabled={bindingsMutation.isPending}
            onClick={() => applyCharacter(null)}
            type="button"
          >
            Отвязать
          </button>
        ) : null}
      </div>
      {editingCharacter ? (
        <CharacterPickerList
          activeId={characterId}
          disabled={bindingsMutation.isPending}
          items={characterListQuery.data?.items ?? []}
          loading={characterListQuery.isLoading}
          onSelect={applyCharacter}
        />
      ) : null}

      <div className="col gap-4" style={{ marginTop: 6 }}>
        <div className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
          Сценарий
        </div>
        {scenarioId && scenarioName ? (
          <>
            <div style={{ fontSize: 'var(--fz-sm)' }}>{scenarioName}</div>
            <div className="row gap-6" style={{ flexWrap: 'wrap' }}>
              <Link
                className="btn btn--xs btn--ghost-bordered"
                params={{ scenarioId }}
                style={{ width: 'fit-content' }}
                to="/scenarios/$scenarioId"
              >
                Открыть сценарий
              </Link>
              <button
                className="btn btn--xs btn--ghost-bordered"
                disabled={bindingsMutation.isPending}
                onClick={() => setEditingScenario((current) => !current)}
                type="button"
              >
                {editingScenario ? 'Скрыть' : 'Сменить сценарий'}
              </button>
              <button
                className="btn btn--xs btn--ghost-bordered"
                disabled={bindingsMutation.isPending}
                onClick={() => applyScenario(null)}
                type="button"
              >
                Отвязать
              </button>
            </div>
          </>
        ) : (
          <div className="row gap-6">
            <button
              className="btn btn--xs btn--ghost-bordered"
              disabled={bindingsMutation.isPending}
              onClick={() => setEditingScenario((current) => !current)}
              type="button"
            >
              {editingScenario ? 'Скрыть' : 'Выбрать сценарий'}
            </button>
          </div>
        )}
        {editingScenario ? (
          <ScenarioPickerList
            activeId={scenarioId}
            disabled={bindingsMutation.isPending}
            items={scenarioListQuery.data?.items ?? []}
            loading={scenarioListQuery.isLoading}
            onSelect={applyScenario}
          />
        ) : null}
      </div>
      {mutationError ? (
        <div className="muted" style={{ color: 'var(--danger)', fontSize: 'var(--fz-2xs)' }}>
          {mutationError}
        </div>
      ) : null}
    </div>
  );
}

interface CharacterPickerListProps {
  activeId: string | null;
  disabled: boolean;
  items: { id: string; name: string }[];
  loading: boolean;
  onSelect: (id: string) => void;
}

function CharacterPickerList({ activeId, disabled, items, loading, onSelect }: CharacterPickerListProps) {
  if (loading) {
    return (
      <div className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
        Загружаем список персонажей…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
        В библиотеке пока нет персонажей.
      </div>
    );
  }
  return (
    <div
      className="col gap-2"
      style={{
        maxHeight: 220,
        overflowY: 'auto',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--r-sm)',
        padding: 4,
      }}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            className="btn btn--xs"
            disabled={disabled || isActive}
            key={item.id}
            onClick={() => onSelect(item.id)}
            style={{
              background: isActive ? 'var(--accent-soft)' : 'transparent',
              border: 0,
              color: isActive ? 'var(--accent)' : 'inherit',
              justifyContent: 'flex-start',
              textAlign: 'left',
            }}
            title={item.id}
            type="button"
          >
            {item.name}
          </button>
        );
      })}
    </div>
  );
}

interface ScenarioPickerListProps {
  activeId: string | null;
  disabled: boolean;
  items: { id: string; name: string }[];
  loading: boolean;
  onSelect: (id: string) => void;
}

function ScenarioPickerList({ activeId, disabled, items, loading, onSelect }: ScenarioPickerListProps) {
  if (loading) {
    return (
      <div className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
        Загружаем сценарии…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
        В библиотеке пока нет сценариев.
      </div>
    );
  }
  return (
    <div
      className="col gap-2"
      style={{
        maxHeight: 220,
        overflowY: 'auto',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--r-sm)',
        padding: 4,
      }}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            className="btn btn--xs"
            disabled={disabled || isActive}
            key={item.id}
            onClick={() => onSelect(item.id)}
            style={{
              background: isActive ? 'var(--accent-soft)' : 'transparent',
              border: 0,
              color: isActive ? 'var(--accent)' : 'inherit',
              justifyContent: 'flex-start',
              textAlign: 'left',
            }}
            title={item.id}
            type="button"
          >
            {item.name}
          </button>
        );
      })}
    </div>
  );
}

interface ContextSectionContentProps {
  stats?: ContextStats | undefined;
}

function ContextSectionContent({ stats }: ContextSectionContentProps) {
  if (!stats) {
    return (
      <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
        Превью контекста пока не загружено.
      </div>
    );
  }
  const lines: [string, string][] = [
    ['всего', stats.totalTokens.toLocaleString('ru-RU')],
    ['контекст-окно', stats.contextWindow.toLocaleString('ru-RU')],
    ['сообщений', String(stats.messageCount)],
    ['system', stats.systemTokens.toLocaleString('ru-RU')],
    ['transcript', stats.transcriptTokens.toLocaleString('ru-RU')],
  ];
  if (stats.presetName) lines.push(['preset', stats.presetName]);
  if (stats.modelName) lines.push(['model', stats.modelName]);

  return (
    <div className="col gap-8">
      <div className="card" style={{ padding: 10, background: 'var(--surface)', display: 'grid', gap: 6 }}>
        {lines.map(([k, v]) => (
          <div className="between" key={k} style={{ fontSize: 'var(--fz-xs)' }}>
            <span className="muted">{k}</span>
            <span className="mono tnum">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface TokenBarProps {
  fill: number;
  label: string;
  total: number;
}

function TokenBar({ fill, label, total }: TokenBarProps) {
  const ratio = total > 0 ? Math.min(1, fill / total) : 0;
  const percent = Math.round(ratio * 100);
  const fillStyle: CSSProperties = {
    width: `${Math.max(0, Math.min(100, percent))}%`,
  };
  const isWarn = ratio >= 0.8;
  return (
    <div className="tokenbar" style={{ width: 200 }}>
      <div className="tokenbar__track">
        <div className={isWarn ? 'tokenbar__fill tokenbar__fill--warn' : 'tokenbar__fill'} style={fillStyle} />
      </div>
      <div className="tnum mono">{label}</div>
    </div>
  );
}
