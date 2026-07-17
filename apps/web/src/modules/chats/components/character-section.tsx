import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { createApiUrl } from '../../../shared/api/client';
import { getApiErrorMessage } from '../../../shared/api/get-api-error-message';
import { avatarColor, avatarInitial } from '../../../shared/lib/avatar';
import { characterListQueryOptions } from '../../characters/queries/character-list-query';
import { scenarioListQueryOptions } from '../../scenarios/queries/scenario-list-query';
import { useUpdateChatBindings } from '../mutations/use-update-chat-bindings';
import { PickerList } from './picker-list';

export interface CharacterSectionContentProps {
  chatId: string;
  characterAvatarUrl: string | null;
  characterId: string | null;
  characterName: string | null;
  scenarioId: string | null;
  scenarioName: string | null;
}

export function CharacterSectionContent({
  chatId,
  characterAvatarUrl,
  characterId,
  characterName,
  scenarioId,
  scenarioName,
}: CharacterSectionContentProps) {
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
    ? getApiErrorMessage(bindingsMutation.error, 'Не удалось обновить привязку.')
    : null;

  let toggleCharacterLabel = 'Выбрать персонажа';
  if (editingCharacter) {
    toggleCharacterLabel = 'Скрыть';
  } else if (characterId) {
    toggleCharacterLabel = 'Сменить персонажа';
  }

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
          {toggleCharacterLabel}
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
        <PickerList
          activeId={characterId}
          disabled={bindingsMutation.isPending}
          emptyText="В библиотеке пока нет персонажей."
          items={characterListQuery.data?.items ?? []}
          loading={characterListQuery.isLoading}
          loadingText="Загружаем список персонажей…"
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
          <PickerList
            activeId={scenarioId}
            disabled={bindingsMutation.isPending}
            emptyText="В библиотеке пока нет сценариев."
            items={scenarioListQuery.data?.items ?? []}
            loading={scenarioListQuery.isLoading}
            loadingText="Загружаем сценарии…"
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
