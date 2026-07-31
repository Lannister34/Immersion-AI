import { useState } from 'react';
import { formatRelative } from '../../../shared/lib/format-relative';
import { pluralRu } from '../../../shared/lib/plural';
import { Avatar } from '../../../shared/ui/avatar';
import { EditIcon, SparkleIcon } from '../../../shared/ui/icons';
import type { ContextStats } from '../view-models/context-stats';
import { ContextMeter } from './context-meter';

export interface ChatHeaderProps {
  avatarUrl: string | null;
  canGenerateTitle: boolean;
  characterName: string;
  errorMessage: string | null;
  isGeneratingTitle: boolean;
  isRenaming: boolean;
  messageCount: number;
  onGenerateTitle: () => void;
  onRename: (title: string) => void;
  stats: ContextStats | undefined;
  title: string;
  updatedAt: string;
}

export function ChatHeader({
  avatarUrl,
  canGenerateTitle,
  characterName,
  errorMessage,
  isGeneratingTitle,
  isRenaming,
  messageCount,
  onGenerateTitle,
  onRename,
  stats,
  title,
  updatedAt,
}: ChatHeaderProps) {
  const [draftTitle, setDraftTitle] = useState<string | null>(null);

  const commit = () => {
    if (draftTitle === null || isRenaming) {
      return;
    }
    const value = draftTitle.trim();
    if (value.length > 0 && value !== title) {
      onRename(value);
    }
    setDraftTitle(null);
  };

  return (
    <div
      className="row gap-12"
      style={{
        alignItems: 'center',
        borderBottom: '1px solid var(--hairline)',
        padding: '12px 22px',
        position: 'relative',
      }}
    >
      <Avatar name={characterName} size={36} url={avatarUrl} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {draftTitle === null ? (
          <div className="row gap-6" style={{ alignItems: 'center' }}>
            <h1 className="truncate" style={{ fontSize: 'var(--fz-md)', fontWeight: 600, margin: 0 }}>
              {title}
            </h1>
            <button
              onClick={() => setDraftTitle(title)}
              style={{ color: 'var(--muted-dim)', display: 'flex' }}
              title="Переименовать чат"
              type="button"
            >
              <EditIcon size={12} />
            </button>
          </div>
        ) : (
          <div className="row gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              autoFocus
              className="input"
              disabled={isRenaming}
              onBlur={commit}
              onChange={(event) => {
                const { value } = event.currentTarget;
                setDraftTitle(value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commit();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setDraftTitle(null);
                }
              }}
              style={{ borderColor: 'var(--accent)', fontSize: 'var(--fz-md)', fontWeight: 600, width: 340 }}
              value={draftTitle}
            />
            <button
              className="btn btn--xs btn--primary"
              onClick={commit}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              Готово
            </button>
            {canGenerateTitle ? (
              <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
                или{' '}
                <button
                  disabled={isGeneratingTitle}
                  onClick={() => {
                    // Название придёт с сервера — свой черновик закрываем, чтобы он его не перекрыл.
                    setDraftTitle(null);
                    onGenerateTitle();
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  style={{ color: 'var(--accent)' }}
                  type="button"
                >
                  <SparkleIcon size={11} /> {isGeneratingTitle ? 'генерируем…' : 'сгенерировать по переписке'}
                </button>
              </span>
            ) : null}
          </div>
        )}
        <div className="muted row gap-6" style={{ alignItems: 'center', fontSize: 'var(--fz-xs)' }}>
          <span>
            {pluralRu(messageCount, ['сообщение', 'сообщения', 'сообщений'])} · изменён {formatRelative(updatedAt)}
          </span>
          {errorMessage ? <span style={{ color: 'var(--danger)' }}>{errorMessage}</span> : null}
        </div>
      </div>
      {stats ? <ContextMeter stats={stats} /> : null}
    </div>
  );
}
