import type { ChatSummaryDto } from '@immersion/contracts/chats';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { formatRelative } from '../../../shared/lib/format-relative';
import { Avatar } from '../../../shared/ui/avatar';
import { TrashIcon, XIcon } from '../../../shared/ui/icons';
import { useDeleteChat } from '../mutations/use-delete-chat';
import { stripMessageMarkup } from '../view-models/strip-message-markup';

interface ChatListRowProps {
  chat: ChatSummaryDto;
}

export function ChatListRow({ chat }: ChatListRowProps) {
  const displayName = chat.characterName ?? chat.title;
  const subline = chat.characterName ? chat.title : 'свободный чат';
  const preview = chat.lastMessagePreview ? stripMessageMarkup(chat.lastMessagePreview) : 'Сообщений пока нет.';
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

  return (
    <div className="chat-row">
      <Link
        aria-label={`Открыть чат: ${displayName}`}
        params={{ chatId: chat.id }}
        style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'pointer' }}
        to="/chat/$chatId"
      />
      <Avatar name={displayName} size={36} url={chat.characterAvatarUrl} />
      <div className="chat-row__title">
        <strong className="truncate" style={{ display: 'block', fontSize: 'var(--fz-md)' }}>
          {displayName}
        </strong>
        <div className="muted truncate mt-4" style={{ fontSize: 'var(--fz-xs)' }}>
          {subline}
        </div>
      </div>
      <div className="muted truncate chat-row__preview">{preview}</div>
      <div className="muted mono tnum chat-row__time">{formatRelative(chat.updatedAt)}</div>
      <div className="row gap-4 chat-row__actions">
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
