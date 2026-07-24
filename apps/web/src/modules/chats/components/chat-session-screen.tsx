import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { Topbar } from '../../../app/layout/topbar';
import { useUiShellStore } from '../../../app/store/ui-shell';
import { ApiError, createApiUrl } from '../../../shared/api/client';
import { getApiErrorMessage } from '../../../shared/api/get-api-error-message';
import { avatarColor, avatarInitial } from '../../../shared/lib/avatar';
import { formatRelative } from '../../../shared/lib/format-relative';
import { useDebouncedValue } from '../../../shared/lib/use-debounced-value';
import { DownloadIcon, SparkleIcon, TrashIcon } from '../../../shared/ui/icons';
import {
  chatReplyPromptPreviewQueryOptions,
  generationReadinessQueryOptions,
  toGenerationAvailabilityViewModel,
  useChatReplyGeneration,
  useGenerateChatTitle,
  useGenerateFirstMessage,
} from '../../generation';
import { settingsOverviewQueryOptions } from '../../settings';
import { useBranchChat } from '../mutations/use-branch-chat';
import { useDeleteChat } from '../mutations/use-delete-chat';
import { useDeleteChatMessage } from '../mutations/use-delete-chat-message';
import { useUpdateChatMessage } from '../mutations/use-update-chat-message';
import { useUpdateChatTitle } from '../mutations/use-update-chat-title';
import { chatSessionQueryOptions } from '../queries/chat-session-query';
import { toContextStats } from '../view-models/context-stats';
import { BubbleMessage } from './bubble-message';
import { Composer } from './composer';
import { RightPanel } from './right-panel';
import { TokenBar } from './token-bar';

export interface ChatSessionScreenProps {
  chatId: string;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function describeGenerateTitleError(error: unknown): string | null {
  if (!error) {
    return null;
  }
  if (error instanceof ApiError && error.code === 'chat_title_conflict') {
    return 'Чат уже переименовали вручную — оставили ваш вариант.';
  }
  return getApiErrorMessage(error, 'Не удалось сгенерировать название.');
}

export function ChatSessionScreen({ chatId }: ChatSessionScreenProps) {
  const [draftMessage, setDraftMessage] = useState('');
  const debouncedDraftMessage = useDebouncedValue(draftMessage, 400);
  const openSection = useUiShellStore((state) => state.chatRightPanelSection);
  const setOpenSection = useUiShellStore((state) => state.setChatRightPanelSection);
  const isPanelOpen = useUiShellStore((state) => state.chatRightPanelOpen);
  const closePanel = useUiShellStore((state) => state.closeChatRightPanel);
  const openPanelSection = useUiShellStore((state) => state.openChatRightPanelSection);
  const navigate = useNavigate();

  const chatSessionQuery = useQuery(chatSessionQueryOptions(chatId));
  const generationReadinessQuery = useQuery(generationReadinessQueryOptions());
  const promptPreviewQuery = useQuery(chatReplyPromptPreviewQueryOptions(chatId, debouncedDraftMessage));
  const settingsOverviewQuery = useQuery(settingsOverviewQueryOptions());
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
  const generateTitleMutation = useGenerateChatTitle(chatId);
  const generateFirstMessageMutation = useGenerateFirstMessage(chatId);

  const transcriptRef = useRef<HTMLDivElement | null>(null);
  // Прилипание к низу: пока пользователь у последнего сообщения, лента следует
  // за новыми сообщениями и растущим ответом; если он ушёл читать выше — нет.
  const stickToBottomRef = useRef(true);
  const transcriptMessageCount = chatSessionQuery.data?.messages.length;
  // Любое из значений меняет высоту ленты: новое сообщение, растущий ответ, индикатор печати.
  const transcriptSignature = [
    transcriptMessageCount ?? -1,
    chatSessionQuery.data?.messages.at(-1)?.content.length ?? 0,
    chatReplyGeneration.activeJob ? 1 : 0,
  ].join(':');

  const handleTranscriptScroll = () => {
    const element = transcriptRef.current;
    if (!element) {
      return;
    }
    stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  };

  useEffect(() => {
    const element = transcriptRef.current;
    if (transcriptSignature.startsWith('-1:') || !stickToBottomRef.current || !element) {
      return;
    }
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [transcriptSignature]);

  if (chatSessionQuery.isLoading) {
    return (
      <main className="main">
        <Topbar
          crumbs={[
            { label: 'Чаты', to: '/chat' },
            { label: 'Загрузка…', strong: true },
          ]}
        />
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
        <Topbar
          crumbs={[
            { label: 'Чаты', to: '/chat' },
            { label: 'Чат не найден', strong: true },
          ]}
        />
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
    ? getApiErrorMessage(
        chatReplyGeneration.error,
        'Не удалось получить ответ модели. Проверьте API и повторите попытку.',
      )
    : jobErrorMessage;
  const deleteChatErrorMessage = deleteChatMutation.error
    ? getApiErrorMessage(deleteChatMutation.error, 'Не удалось удалить чат.')
    : null;
  const renameChatErrorMessage = renameChatMutation.error
    ? getApiErrorMessage(renameChatMutation.error, 'Не удалось переименовать чат.')
    : null;
  const generateTitleErrorMessage = describeGenerateTitleError(generateTitleMutation.error);
  const generateFirstMessageErrorMessage = generateFirstMessageMutation.error
    ? getApiErrorMessage(generateFirstMessageMutation.error, 'Не удалось сгенерировать первое сообщение.')
    : null;

  const commitRename = () => {
    if (renamingTitle === null || renameChatMutation.isPending) {
      return;
    }
    const value = renamingTitle.trim();
    if (value.length > 0 && value !== session.chat.title) {
      renameChatMutation.mutate({ title: value });
    } else {
      setRenamingTitle(null);
    }
  };

  const blockReason = generationAvailability.blockReason;
  const isStreaming = Boolean(chatReplyGeneration.activeJob);
  const canSend =
    draftMessage.trim().length > 0 &&
    !chatReplyGeneration.isPending &&
    !generateFirstMessageMutation.isPending &&
    !blockReason;
  const lastTranscriptMessage = session.messages.at(-1);
  const canContinue =
    !isStreaming &&
    !chatReplyGeneration.isPending &&
    !generateFirstMessageMutation.isPending &&
    !blockReason &&
    lastTranscriptMessage?.role === 'assistant' &&
    lastTranscriptMessage.content.trim().length > 0;
  // Транскрипт заканчивается репликой пользователя — модель может ответить без нового сообщения.
  const canAnswer =
    !isStreaming &&
    !chatReplyGeneration.isPending &&
    !generateFirstMessageMutation.isPending &&
    !blockReason &&
    lastTranscriptMessage?.role === 'user' &&
    lastTranscriptMessage.content.trim().length > 0;

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

  const onContinue = async () => {
    if (!canContinue) return;
    try {
      await chatReplyGeneration.continueLast();
    } catch {
      // Ошибка показывается через generationErrorMessage.
    }
  };

  const onAnswer = async () => {
    if (!canAnswer) return;
    try {
      await chatReplyGeneration.answerLast();
    } catch {
      // Ошибка показывается через generationErrorMessage.
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

  const renderTranscriptMessages = () => {
    const lastAssistantId = [...session.messages].reverse().find((m) => m.role === 'assistant')?.id;
    const baseTitle = session.chat.title.trim();
    const defaultBranchTitle = baseTitle.endsWith(' (ветка)') ? baseTitle : `${baseTitle || 'Новая ветка'} (ветка)`;
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
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isPanelOpen ? 'minmax(0, 1fr) 320px' : 'minmax(0, 1fr)',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <main className="main">
        <Topbar
          crumbs={[
            { label: 'Чаты', to: '/chat' },
            { label: `${characterDisplay} · ${session.chat.title}`, strong: true },
          ]}
          actions={
            <>
              {deleteChatErrorMessage ? (
                <span style={{ color: 'var(--danger)', fontSize: 'var(--fz-xs)' }}>{deleteChatErrorMessage}</span>
              ) : null}
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
            </>
          }
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
                    onBlur={commitRename}
                    onChange={(event) => setRenamingTitle(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitRename();
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
                    disabled={generateTitleMutation.isPending}
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
                {!isStreaming && renamingTitle === null ? (
                  <button
                    className="btn"
                    disabled={generateTitleMutation.isPending || generationAvailability.isBlocked || messageCount === 0}
                    onClick={() => {
                      if (!generateTitleMutation.isPending) {
                        generateTitleMutation.mutate();
                      }
                    }}
                    style={{ fontSize: 'var(--fz-xs)', height: 24, padding: '2px 8px' }}
                    title="Сгенерировать название чата по переписке"
                    type="button"
                  >
                    <SparkleIcon size={12} />{' '}
                    {generateTitleMutation.isPending ? 'Генерируем…' : 'Сгенерировать название'}
                  </button>
                ) : null}
                <span>
                  · {messageCount} сообщ. · ред. {formatRelative(lastUpdated)}
                </span>
                {renameChatErrorMessage ? (
                  <span style={{ color: 'var(--danger)' }}>{renameChatErrorMessage}</span>
                ) : null}
                {generateTitleErrorMessage ? (
                  <span style={{ color: 'var(--danger)' }}>{generateTitleErrorMessage}</span>
                ) : null}
              </div>
            </div>
            {tokenStats ? (
              <div className="row gap-12" style={{ minWidth: 240 }}>
                <TokenBar
                  approximate={tokenStats.tokenCountMethod === 'approximate'}
                  fill={tokenStats.totalTokens}
                  label={`${tokenStats.totalTokens.toLocaleString('ru-RU')} / ${tokenStats.contextWindow.toLocaleString('ru-RU')}`}
                  total={tokenStats.contextWindow}
                />
              </div>
            ) : null}
          </div>
          <div
            onScroll={handleTranscriptScroll}
            ref={transcriptRef}
            style={{ overflow: 'auto', padding: '18px 22px', background: 'var(--bg)' }}
          >
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
                  {!isStreaming ? (
                    <>
                      <button
                        className="btn"
                        disabled={generateFirstMessageMutation.isPending || generationAvailability.isBlocked}
                        onClick={() => {
                          if (!generateFirstMessageMutation.isPending) {
                            generateFirstMessageMutation.mutate();
                          }
                        }}
                        style={{ marginTop: 12 }}
                        type="button"
                      >
                        <SparkleIcon size={14} />{' '}
                        {generateFirstMessageMutation.isPending ? 'Генерируем…' : 'Сгенерировать первое сообщение'}
                      </button>
                      {generateFirstMessageErrorMessage ? (
                        <p style={{ color: 'var(--danger)', fontSize: 'var(--fz-xs)', marginTop: 8 }}>
                          {generateFirstMessageErrorMessage}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : (
                renderTranscriptMessages()
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
                canAnswer={canAnswer}
                canContinue={canContinue}
                canSend={canSend}
                isStreaming={isStreaming}
                onCancel={chatReplyGeneration.cancel}
                onChange={(event) => setDraftMessage(event.currentTarget.value)}
                onAnswer={() => void onAnswer()}
                onContinue={() => void onContinue()}
                onKeyDown={onComposerKeyDown}
                onOpenLorebooks={() => openPanelSection('lorebooks')}
                onOpenSettings={() => openPanelSection('settings')}
                onSubmit={onSubmit}
                value={draftMessage}
              />
            </div>
          </div>
        </div>
      </main>
      {isPanelOpen ? (
        <RightPanel
          characterAvatarUrl={session.characterAvatarUrl}
          characterId={session.characterId}
          characterName={session.characterName}
          chatId={chatId}
          contextStats={tokenStats}
          generationSettings={session.generationSettings}
          lorebookIds={session.lorebookIds}
          onClose={closePanel}
          onSectionToggle={(id) => setOpenSection(openSection === id ? null : id)}
          openSection={openSection}
          scenarioId={session.scenarioId}
          scenarioName={session.scenarioName}
          settingsOverview={settingsOverviewQuery.data}
        />
      ) : null}
    </div>
  );
}
