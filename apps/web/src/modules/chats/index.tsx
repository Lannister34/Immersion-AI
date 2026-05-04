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
  type ReactNode,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Topbar } from '../../app/layout/topbar';
import { ApiError } from '../../shared/api/client';
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
  FilterIcon,
  MoreIcon,
  PaperclipIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SendIcon,
  SlidersIcon,
  SortIcon,
  StopIcon,
  UploadIcon,
  UserIcon,
  XIcon,
} from '../../shared/ui/icons';
import {
  chatReplyPromptPreviewQueryBaseKey,
  chatReplyPromptPreviewQueryOptions,
  generationReadinessQueryOptions,
  toGenerationAvailabilityViewModel,
  useChatReplyGeneration,
} from '../generation';
import { settingsOverviewQueryOptions } from '../settings';
import { createChat } from './api/create-chat';
import { useUpdateChatGenerationSettings } from './mutations/use-update-chat-generation-settings';
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
  const chatListQuery = useQuery(chatListQueryOptions());
  const [search, setSearch] = useState('');
  const createMutation = useMutation({
    mutationFn: createChat,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      await navigate({ to: '/chat/$chatId', params: { chatId: response.chat.id } });
    },
  });

  const allItems = chatListQuery.data?.items ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((item) =>
      [item.title, item.characterName, item.lastMessagePreview]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q)),
    );
  }, [allItems, search]);

  const characterCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of allItems) {
      const key = item.characterName ?? 'Свободный';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).slice(0, 6);
  }, [allItems]);

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
              <button className="btn btn--ghost-bordered" type="button">
                <FilterIcon size={13} /> Фильтр
              </button>
              <button className="btn btn--ghost-bordered" type="button">
                <SortIcon size={13} /> Активность ↓
              </button>
            </div>
          </div>
          {characterCounts.length > 0 ? (
            <div className="filters">
              <span className="filter-chip" data-active="true">
                Все
              </span>
              {characterCounts.map(([name, count]) => (
                <span className="filter-chip" key={name}>
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
                  ? 'Создайте первую сессию — кнопка «Новый чат» в правом верхнем углу.'
                  : 'Попробуйте изменить запрос или сбросить фильтры.'}
              </p>
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
  return (
    <Link
      params={{ chatId: chat.id }}
      style={{
        display: 'grid',
        gridTemplateColumns: '40px minmax(0, 1.2fr) minmax(0, 2fr) 100px 80px',
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
      <div className="avatar avatar--36" style={{ background: avatarColor(displayName), color: 'white', border: 0 }}>
        {avatarInitial(displayName)}
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
      <div className="row gap-4" style={{ justifyContent: 'flex-end' }}>
        <span className="tag mono tnum">{chat.messageCount}</span>
        <button className="btn btn--icon btn--xs" onClick={(event) => event.preventDefault()} type="button">
          <MoreIcon size={12} />
        </button>
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

type RightPanelSection = 'settings' | 'character' | 'context' | null;

export function ChatSessionScreen({ chatId }: ChatSessionScreenProps) {
  const [draftMessage, setDraftMessage] = useState('');
  const deferredDraftMessage = useDeferredValue(draftMessage);
  const [openSection, setOpenSection] = useState<RightPanelSection>('settings');
  const queryClient = useQueryClient();

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
              <button className="btn" type="button">
                <BranchIcon size={14} /> Разветвить
              </button>
              <button className="btn" type="button">
                <DownloadIcon size={14} /> Экспорт
              </button>
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
              style={{ background: avatarColor(characterDisplay), color: 'white', border: 0 }}
            >
              {avatarInitial(characterDisplay)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--fz-md)' }}>{characterDisplay}</div>
              <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
                {session.chat.title} · {messageCount} сообщ. · ред. {formatRelative(lastUpdated)}
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
                session.messages.map((message) => (
                  <BubbleMessage
                    isUser={message.role === 'user'}
                    isSystem={message.role === 'system'}
                    key={message.id}
                    text={message.content}
                    time={formatTime(message.createdAt)}
                    who={message.role === 'user' ? session.userName : characterDisplay}
                  />
                ))
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
        characterName={session.characterName}
        contextStats={tokenStats}
        onSectionToggle={(id) => setOpenSection(openSection === id ? null : id)}
        openSection={openSection}
        samplerPresetId={session.generationSettings.samplerPresetId}
        sampling={session.generationSettings.sampling}
        settingsOverview={settingsOverviewQuery.data}
      />
    </div>
  );
}

interface BubbleMessageProps {
  isUser: boolean;
  isSystem: boolean;
  text: string;
  time: string;
  who: string;
}

function BubbleMessage({ isUser, isSystem, text, time, who }: BubbleMessageProps) {
  if (isSystem) {
    return <div className="bubble--system bubble">{text}</div>;
  }
  return (
    <div
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
            : { background: avatarColor(who), color: 'white', border: 0 }
        }
      >
        {avatarInitial(who)}
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
        <div className={isUser ? 'bubble bubble--user' : 'bubble'}>{text}</div>
        <div className="row gap-4" style={{ justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
          <button className="btn btn--xs" type="button">
            <RefreshIcon size={12} />
          </button>
          <button className="btn btn--xs" type="button">
            <CopyIcon size={12} />
          </button>
          <button className="btn btn--xs" type="button">
            <EditIcon size={12} />
          </button>
          <button className="btn btn--xs" type="button">
            <BranchIcon size={12} />
          </button>
        </div>
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
  characterName: string | null;
  contextStats?: ContextStats | undefined;
  onSectionToggle: (section: RightPanelSection) => void;
  openSection: RightPanelSection;
  samplerPresetId: string | null;
  sampling: Record<string, number | string | null>;
  settingsOverview?: SettingsOverviewResponse | undefined;
}

function RightPanel({
  characterName,
  contextStats,
  onSectionToggle,
  openSection,
  samplerPresetId,
  sampling,
  settingsOverview,
}: RightPanelProps) {
  const sections: { id: NonNullable<RightPanelSection>; label: string; icon: ReactNode }[] = [
    { id: 'settings', label: 'Настройки генерации', icon: <SlidersIcon size={13} stroke="var(--muted)" /> },
    { id: 'character', label: 'Персонаж', icon: <UserIcon size={13} stroke="var(--muted)" /> },
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
                    <CharacterSectionContent characterName={characterName} />
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

function CharacterSectionContent({ characterName }: { characterName: string | null }) {
  if (!characterName) {
    return (
      <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
        У этого чата нет привязанного персонажа. Это свободный чат.
      </div>
    );
  }
  return (
    <div className="col gap-10">
      <div className="row gap-10">
        <div
          className="avatar avatar--36"
          style={{ background: avatarColor(characterName), color: 'white', border: 0 }}
        >
          {avatarInitial(characterName)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{characterName}</div>
          <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
            привязан к чату
          </div>
        </div>
      </div>
      <div className="row gap-6">
        <Link className="btn btn--xs" to="/characters">
          Открыть карточку
        </Link>
        <button className="btn btn--xs btn--ghost-bordered" type="button">
          Сменить
        </button>
      </div>
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
