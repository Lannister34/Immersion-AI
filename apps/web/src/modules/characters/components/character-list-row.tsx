import type { CharacterSummaryDto } from '@immersion/contracts/characters';
import { Link } from '@tanstack/react-router';

import { createApiUrl } from '../../../shared/api/client';
import { avatarColor, avatarInitial } from '../../../shared/lib/avatar';
import { formatRelative } from '../../../shared/lib/format-relative';
import { ChatIcon } from '../../../shared/ui/icons';
import { useCharacterActions } from '../mutations/use-character-actions';
import { characterChatsLabel } from '../view-models/character-chats-label';
import { CharacterDeleteControls } from './character-delete-controls';

interface CharacterListRowProps {
  character: CharacterSummaryDto;
}

export function CharacterListRow({ character }: CharacterListRowProps) {
  const color = avatarColor(character.name);
  const initial = avatarInitial(character.name);
  const actions = useCharacterActions(character);

  return (
    <tr>
      <td>
        <Link
          className="row gap-8"
          params={{ characterId: character.id }}
          style={{ color: 'inherit', textDecoration: 'none', alignItems: 'center' }}
          to="/characters/$characterId"
        >
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              flexShrink: 0,
              background: character.avatarUrl
                ? `center / cover no-repeat url("${createApiUrl(character.avatarUrl)}"), ${color}`
                : color,
              display: 'grid',
              placeItems: 'center',
              color: 'white',
              fontSize: 'var(--fz-xs)',
              fontWeight: 600,
            }}
          >
            {character.avatarUrl ? null : initial}
          </span>
          <strong style={{ fontWeight: 600 }}>{character.name}</strong>
        </Link>
      </td>
      <td style={{ fontSize: 'var(--fz-xs)' }}>
        {character.chatCount > 0 ? (
          <Link
            search={{ character: character.name }}
            style={{ color: 'inherit' }}
            title="Показать чаты с этим персонажем"
            to="/chat"
          >
            {characterChatsLabel(character.chatCount)}
            {character.lastChatAt ? ` · ${formatRelative(character.lastChatAt)}` : ''}
          </Link>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="muted mono tnum" style={{ fontSize: 'var(--fz-xs)' }}>
        {formatRelative(character.updatedAt)}
      </td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <div className="row gap-4" style={{ justifyContent: 'flex-end' }}>
          <button
            className="btn btn--xs btn--primary"
            disabled={actions.startChatMutation.isPending}
            onClick={actions.handleStartChat}
            title="Начать новый чат с этим персонажем"
            type="button"
          >
            <ChatIcon size={11} /> {actions.startChatMutation.isPending ? '…' : 'Чат'}
          </button>
          <CharacterDeleteControls actions={actions} />
        </div>
      </td>
    </tr>
  );
}
