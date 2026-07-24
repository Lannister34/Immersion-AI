import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { createApiUrl } from '../../../shared/api/client';
import { avatarColor, avatarInitial } from '../../../shared/lib/avatar';
import { pluralRu } from '../../../shared/lib/plural';
import { BookIcon, TheaterIcon, UserIcon } from '../../../shared/ui/icons';
import { characterDetailQueryOptions } from '../../characters/queries/character-detail-query';
import { lorebookListQueryOptions } from '../../lorebooks/queries/lorebook-list-query';

export interface ChatBindingsProps {
  characterAvatarUrl: string | null;
  characterId: string | null;
  characterName: string | null;
  lorebookIds: string[];
  scenarioName: string | null;
}

interface BindingRowProps {
  icon: ReactNode;
  label: string;
  value: string;
}

function BindingRow({ icon, label, value }: BindingRowProps) {
  return (
    <div className="rp-binding">
      {icon}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 'var(--fz-sm)' }}>{label}</span>
        <span className="truncate" style={{ color: 'var(--muted-dim)', display: 'block', fontSize: 'var(--fz-xs)' }}>
          {value}
        </span>
      </span>
    </div>
  );
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0]?.trim() ?? '';
}

/** Привязки чата: пока только показываем — менять их по ходу переписки нельзя. */
export function ChatBindings({
  characterAvatarUrl,
  characterId,
  characterName,
  lorebookIds,
  scenarioName,
}: ChatBindingsProps) {
  const characterQuery = useQuery({
    ...characterDetailQueryOptions(characterId ?? ''),
    enabled: characterId !== null,
  });
  const lorebooksQuery = useQuery({ ...lorebookListQueryOptions(), enabled: lorebookIds.length > 0 });

  const description = characterQuery.data ? firstLine(characterQuery.data.character.description) : '';
  const characterValue = characterName
    ? [characterName, description].filter((part) => part.length > 0).join(' · ')
    : 'не выбран — свободный чат';

  const selectedLorebooks = (lorebooksQuery.data?.items ?? []).filter((lorebook) => lorebookIds.includes(lorebook.id));
  const entryCount = selectedLorebooks.reduce((total, lorebook) => total + lorebook.entryCount, 0);
  let lorebooksValue = 'не подключены';
  if (lorebookIds.length > 0) {
    const names = selectedLorebooks.map((lorebook) => lorebook.name).join(', ');
    lorebooksValue =
      selectedLorebooks.length > 0
        ? `${names} · ${pluralRu(entryCount, ['запись', 'записи', 'записей'])}`
        : pluralRu(lorebookIds.length, ['лорбук', 'лорбука', 'лорбуков']);
  }

  return (
    <div className="col">
      <BindingRow
        icon={
          characterName ? (
            <span
              className="avatar"
              style={
                characterAvatarUrl
                  ? {
                      background: `center / cover no-repeat url("${createApiUrl(characterAvatarUrl)}")`,
                      border: 0,
                      flex: 'none',
                      height: 26,
                      width: 26,
                    }
                  : {
                      background: avatarColor(characterName),
                      border: 0,
                      color: 'white',
                      flex: 'none',
                      fontSize: 'var(--fz-xs)',
                      height: 26,
                      width: 26,
                    }
              }
            >
              {characterAvatarUrl ? null : avatarInitial(characterName)}
            </span>
          ) : (
            <span className="rp-binding__icon">
              <UserIcon size={13} />
            </span>
          )
        }
        label="Персонаж"
        value={characterValue}
      />
      <BindingRow
        icon={
          <span className="rp-binding__icon">
            <TheaterIcon size={13} />
          </span>
        }
        label="Сценарий"
        value={scenarioName ?? 'не выбран'}
      />
      <BindingRow
        icon={
          <span className="rp-binding__icon">
            <BookIcon size={13} />
          </span>
        }
        label="Лорбуки"
        value={lorebooksValue}
      />
    </div>
  );
}
