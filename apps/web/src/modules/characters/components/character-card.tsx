import type { CharacterSummaryDto } from '@immersion/contracts/characters';
import { Link } from '@tanstack/react-router';

import { createApiUrl } from '../../../shared/api/client';
import { avatarColor, avatarInitial } from '../../../shared/lib/avatar';
import { formatRelative } from '../../../shared/lib/format-relative';
import { ChatIcon } from '../../../shared/ui/icons';
import { useCharacterActions } from '../mutations/use-character-actions';
import { characterChatsLabel } from '../view-models/character-chats-label';
import { CharacterDeleteControls } from './character-delete-controls';

interface CharacterCardProps {
  character: CharacterSummaryDto;
}

export function CharacterCard({ character }: CharacterCardProps) {
  const color = avatarColor(character.name);
  const initial = avatarInitial(character.name);
  const actions = useCharacterActions(character);
  const revealActionsOnHover = !actions.confirmDelete;

  return (
    <div
      className="card card-hover"
      style={{
        padding: 0,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        position: 'relative',
      }}
    >
      <Link
        aria-label={`Открыть карточку: ${character.name}`}
        params={{ characterId: character.id }}
        style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'pointer' }}
        to="/characters/$characterId"
      />
      <div
        style={{
          aspectRatio: '3 / 4',
          background: character.avatarUrl
            ? `center / cover no-repeat url("${createApiUrl(character.avatarUrl)}"), ${color}`
            : color,
          position: 'relative',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <div
          className={revealActionsOnHover ? 'char-card__actions' : undefined}
          style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, zIndex: 2 }}
        >
          <CharacterDeleteControls actions={actions} darkOverlay />
        </div>
        {!character.avatarUrl ? (
          <span
            style={{
              color: 'oklch(1 0 0 / 0.82)',
              fontSize: 38,
              fontWeight: 600,
              letterSpacing: 1,
              userSelect: 'none',
            }}
          >
            {initial}
          </span>
        ) : null}
      </div>
      <div style={{ padding: '10px 12px', display: 'grid', gap: 4 }}>
        <strong
          style={{ fontSize: 'var(--fz-md)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          title={character.id}
        >
          {character.name}
        </strong>
        <div style={{ fontSize: 'var(--fz-xs)' }}>
          {character.chatCount > 0 ? (
            <Link
              className="muted"
              search={{ character: character.name }}
              style={{ position: 'relative', zIndex: 2 }}
              title="Показать чаты с этим персонажем"
              to="/chat"
            >
              {characterChatsLabel(character.chatCount)}
              {character.lastChatAt ? ` · ${formatRelative(character.lastChatAt)}` : ''}
            </Link>
          ) : (
            <span className="muted">Чатов пока нет</span>
          )}
        </div>
      </div>
      <div
        className="between"
        style={{ padding: '8px 12px', borderTop: '1px solid var(--hairline)', background: 'var(--bg-2)' }}
      >
        <span className="muted mono" style={{ fontSize: 'var(--fz-xs)' }}>
          {formatRelative(character.updatedAt)}
        </span>
        <button
          className="btn btn--xs btn--primary"
          disabled={actions.startChatMutation.isPending}
          onClick={actions.handleStartChat}
          style={{ position: 'relative', zIndex: 2 }}
          title="Начать новый чат с этим персонажем"
          type="button"
        >
          <ChatIcon size={11} /> {actions.startChatMutation.isPending ? '…' : 'Чат'}
        </button>
      </div>
    </div>
  );
}
