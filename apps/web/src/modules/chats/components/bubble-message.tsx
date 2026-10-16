import type { ChatMessageAttachmentDto } from '@immersion/contracts/chats';
import type { MessageFormatting } from '@immersion/contracts/settings';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { createApiUrl } from '../../../shared/api/client';
import { getApiErrorMessage } from '../../../shared/api/get-api-error-message';
import { avatarInitial } from '../../../shared/lib/avatar';
import { useDebouncedValue } from '../../../shared/lib/use-debounced-value';
import { Avatar } from '../../../shared/ui/avatar';
import { BranchIcon, CopyIcon, EditIcon, RefreshIcon, TrashIcon } from '../../../shared/ui/icons';
import { chatReplyPromptPreviewQueryOptions } from '../../generation';
import { toContextStats } from '../view-models/context-stats';
import { renderMessageContent } from '../view-models/message-content';
import { planMessageEditSave } from '../view-models/message-edit-save';
import { ReasoningBlock } from './reasoning-block';

export interface BubbleMessageProps {
  branchTitleDefault: string;
  canChangeMessages: boolean;
  canRegenerate: boolean;
  attachments: ChatMessageAttachmentDto[];
  characterAvatarUrl: string | null;
  reasoning: string | null;
  showReasoning: boolean;
  chatId: string;
  formatting: MessageFormatting;
  isEditing: boolean;
  isSystem: boolean;
  isUser: boolean;
  messageIndex: number;
  onBranch: (title?: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onEndEdit: () => void;
  onRegenerate: () => Promise<void>;
  onSave: (content: string) => Promise<void>;
  onStartEdit: () => void;
  text: string;
  time: string;
  who: string;
}

export function BubbleMessage({
  attachments,
  reasoning,
  showReasoning,
  branchTitleDefault,
  canChangeMessages,
  canRegenerate,
  characterAvatarUrl,
  chatId,
  formatting,
  isEditing,
  isSystem,
  isUser,
  messageIndex,
  onBranch,
  onDelete,
  onEndEdit,
  onRegenerate,
  onSave,
  onStartEdit,
  text,
  time,
  who,
}: BubbleMessageProps) {
  const [draft, setDraft] = useState(text);
  const [branchDraft, setBranchDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const debouncedDraft = useDebouncedValue(draft, 400);
  const trimmedDraft = debouncedDraft.trim();
  const editPreviewQuery = useQuery({
    ...chatReplyPromptPreviewQueryOptions(chatId, undefined, [{ content: trimmedDraft, messageIndex }]),
    enabled: isEditing && trimmedDraft.length > 0 && trimmedDraft !== text,
  });
  const editPreviewStats = isEditing ? toContextStats(editPreviewQuery.data) : undefined;

  if (isSystem) {
    return <div className="bubble--system bubble">{text}</div>;
  }

  const handleStartEdit = () => {
    setDraft(text);
    setActionError(null);
    onStartEdit();
  };

  const handleSave = async () => {
    const plan = planMessageEditSave({ draft, isSaving: busy, savedContent: text });
    if (plan.kind === 'ignore') {
      return;
    }
    if (plan.kind === 'close') {
      onEndEdit();
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await onSave(plan.content);
      onEndEdit();
    } catch (error) {
      setActionError(getApiErrorMessage(error, 'Не удалось сохранить сообщение.'));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    if (busy) {
      return;
    }
    setActionError(null);
    onEndEdit();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // TODO: tell the user when the browser refuses the clipboard write
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await onDelete();
    } catch (error) {
      setActionError(getApiErrorMessage(error, 'Не удалось удалить сообщение.'));
    } finally {
      setBusy(false);
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
    setActionError(null);
    try {
      await onBranch(title.length > 0 ? title : undefined);
      setBranchDraft(null);
    } catch (error) {
      setActionError(getApiErrorMessage(error, 'Не удалось создать ветку.'));
    } finally {
      setBusy(false);
    }
  };

  const isActionsPinned = isEditing || branchDraft !== null;

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
      {isUser ? (
        <div className="avatar avatar--36" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          {avatarInitial(who)}
        </div>
      ) : (
        <Avatar name={who} size={36} url={characterAvatarUrl} />
      )}
      <div
        style={{
          maxWidth: 'min(620px, 80%)',
          width: isEditing ? 'min(620px, 80%)' : undefined,
          display: 'grid',
          gap: 4,
        }}
      >
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
        {isEditing ? (
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
              rows={Math.min(18, Math.max(4, draft.split('\n').length + 1))}
              style={{ minHeight: 120, width: '100%', background: 'transparent', border: '1px solid var(--hairline)' }}
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
                  title={
                    editPreviewStats.tokenCountMethod === 'approximate'
                      ? 'Приблизительная оценка контекста после применения правки'
                      : 'Точный подсчёт контекста после применения правки'
                  }
                >
                  {editPreviewStats.tokenCountMethod === 'approximate' ? '≈ ' : ''}
                  {editPreviewStats.totalTokens.toLocaleString('ru-RU')} /{' '}
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
          <>
            {showReasoning && reasoning ? <ReasoningBlock text={reasoning} /> : null}
            <div className={isUser ? 'bubble bubble--user' : 'bubble'}>
              {attachments.length > 0 ? (
                <div className="bubble__images">
                  {attachments.map((attachment) => (
                    <a href={createApiUrl(attachment.url)} key={attachment.id} rel="noreferrer" target="_blank">
                      <img alt="Вложение сообщения" className="bubble__image" src={createApiUrl(attachment.url)} />
                    </a>
                  ))}
                </div>
              ) : null}
              {renderMessageContent(text, formatting)}
            </div>
          </>
        )}
        {isEditing ? null : (
          <div className="row gap-4 bubble-row__actions" style={{ justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
            {canRegenerate ? (
              <button
                className="btn btn--xs"
                disabled={!canChangeMessages || busy}
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
              disabled={!canChangeMessages || busy}
              onClick={handleStartEdit}
              title="Редактировать"
              type="button"
            >
              <EditIcon size={12} />
            </button>
            <button
              className="btn btn--xs"
              disabled={!canChangeMessages || busy}
              onClick={() => void handleDelete()}
              title="Удалить сообщение"
              type="button"
            >
              <TrashIcon size={12} />
            </button>
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
                  disabled={!canChangeMessages || busy}
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
                disabled={!canChangeMessages || busy}
                onClick={handleBranchOpen}
                title="Разветвить с этой реплики"
                type="button"
              >
                <BranchIcon size={12} />
              </button>
            )}
          </div>
        )}
        {actionError ? (
          <div
            style={{
              color: 'var(--danger)',
              fontSize: 'var(--fz-2xs)',
              textAlign: isUser ? 'right' : 'left',
            }}
          >
            {actionError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
