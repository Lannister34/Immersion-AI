import type { ChatSummaryDto } from '@immersion/contracts/chats';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { createApiUrl } from '../../../shared/api/client';
import { avatarColor, avatarInitial } from '../../../shared/lib/avatar';
import { formatRelative } from '../../../shared/lib/format-relative';
import { TrashIcon, XIcon } from '../../../shared/ui/icons';
import { useDeleteChat } from '../mutations/use-delete-chat';

export interface ChatListRowProps {
  chat: ChatSummaryDto;
}

export function ChatListRow({ chat }: ChatListRowProps) {
  const displayName = chat.characterName ?? chat.title;
  const subline = chat.characterName ? chat.title : 'свободный чат';
  const preview = chat.lastMessagePreview ?? 'Сообщений пока нет.';
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteMutation = useDeleteChat(chat.id);

  const handleDeleteClick = () => {
    setConfirmDelete(true);
  };
  const handleConfirm = () => {
    deleteMutation.mutate(undefined, {
      onSettled: () => setConfirmDelete(false),
    });
  };
  const handleCancel = () => {
    setConfirmDelete(false);
  };

  // Кнопки-действия лежат рядом со ссылкой (не внутри <a>): ссылка — оверлей,
  // действия подняты выше по z-index. Клик по строке ведёт в чат, по кнопке — действие.
  return (
    <div
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '40px minmax(0, 1.2fr) minmax(0, 2fr) 100px minmax(80px, max-content)',
        gap: 14,
        alignItems: 'center',
        padding: '12px 14px',
        background: 'var(--bg)',
      }}
    >
      <Link
        aria-label={`Открыть чат: ${displayName}`}
        params={{ chatId: chat.id }}
        style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'pointer' }}
        to="/chat/$chatId"
      />
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
      <div
        className="row gap-4"
        style={{
          flexWrap: 'nowrap',
          justifyContent: 'flex-end',
          whiteSpace: 'nowrap',
          position: 'relative',
          zIndex: 2,
        }}
      >
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
    </div>
  );
}
