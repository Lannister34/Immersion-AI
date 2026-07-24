import type { CharacterSummaryDto } from '@immersion/contracts/characters';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { type ChangeEvent, type DragEvent, type ReactNode, useMemo, useRef, useState } from 'react';

import { Topbar } from '../../app/layout/topbar';
import { createApiUrl } from '../../shared/api/client';
import { getApiErrorMessage } from '../../shared/api/get-api-error-message';
import { avatarColor, avatarInitial } from '../../shared/lib/avatar';
import { formatRelative } from '../../shared/lib/format-relative';
import { pluralRu } from '../../shared/lib/plural';
import { readFileAsBase64 } from '../../shared/lib/read-file-as-base64';
import {
  ChatIcon,
  GridIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
  SortIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from '../../shared/ui/icons';
import { createChat } from '../chats/api/create-chat';
import { chatListQueryKey } from '../chats/queries/chat-list-query';
import { importCharacterCard } from './api/import-character-card';
import { useDeleteCharacter } from './mutations/use-delete-character';
import { characterListQueryKey, characterListQueryOptions } from './queries/character-list-query';

export { CharacterEditorScreen } from './editor';

function characterCardsLabel(count: number): string {
  return `${pluralRu(count, ['карта', 'карты', 'карт'])} в библиотеке`;
}

function characterChatsLabel(count: number): string {
  return pluralRu(count, ['чат', 'чата', 'чатов']);
}

type CharactersViewMode = 'grid' | 'list';

const VIEW_MODE_STORAGE_KEY = 'immersion.characters.view-mode';

function readStoredViewMode(): CharactersViewMode {
  return window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) === 'list' ? 'list' : 'grid';
}

export function CharactersScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery(characterListQueryOptions());
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<'updated' | 'name'>('updated');
  const [viewMode, setViewMode] = useState<CharactersViewMode>(readStoredViewMode);

  const switchViewMode = (mode: CharactersViewMode) => {
    setViewMode(mode);
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  };
  const [isDragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const items = query.data?.items ?? [];
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matched = needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;
    const collator = new Intl.Collator('ru');
    return [...matched].sort((left, right) => {
      if (sortMode === 'name') {
        return collator.compare(left.name, right.name);
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    });
  }, [items, search, sortMode]);

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const contentBase64 = await readFileAsBase64(file);
      return importCharacterCard({ contentBase64, fileName: file.name });
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: characterListQueryKey });
      await navigate({ to: '/characters/$characterId', params: { characterId: response.character.id } });
    },
  });

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    importMutation.mutate(file);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    // relatedTarget === null означает уход курсора за пределы окна.
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      setDragActive(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = Array.from(event.dataTransfer.files).find((candidate) =>
      candidate.name.toLowerCase().endsWith('.png'),
    );
    if (file) {
      importMutation.mutate(file);
    }
  };

  const importErrorMessage = importMutation.error
    ? getApiErrorMessage(importMutation.error, 'Не удалось импортировать карточку.')
    : null;

  let subtitle = characterCardsLabel(items.length);
  if (query.isLoading) {
    subtitle = 'Загружаем карточки…';
  } else if (query.isError) {
    subtitle = 'Не удалось загрузить персонажей';
  }

  let body: ReactNode;
  if (query.isLoading) {
    body = <CharactersGridSkeleton />;
  } else if (query.isError) {
    body = (
      <div className="empty">
        <h2>Не удалось загрузить карточки</h2>
        <p>Проверьте rewrite API и повторите попытку.</p>
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <div className="empty">
        <h2>Папка персонажей пуста</h2>
        <p>Перетащите PNG-карточку SillyTavern в окно, нажмите «Импорт» или создайте нового персонажа.</p>
        <div className="row gap-8" style={{ marginTop: 12, justifyContent: 'center' }}>
          <button className="btn" disabled={importMutation.isPending} onClick={handleImportClick} type="button">
            <UploadIcon size={13} /> Импорт PNG
          </button>
          <Link className="btn btn--primary" to="/characters/new">
            <PlusIcon size={13} /> Новый персонаж
          </Link>
        </div>
      </div>
    );
  } else if (filtered.length === 0) {
    body = (
      <div className="empty">
        <h2>Ничего не найдено</h2>
        <p>Поиск не дал совпадений по имени файла.</p>
      </div>
    );
  } else if (viewMode === 'grid') {
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        {filtered.map((character) => (
          <CharacterCard character={character} key={character.id} />
        ))}
      </div>
    );
  } else {
    body = <CharactersListTable characters={filtered} />;
  }

  return (
    <main
      className="main"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={isDragActive ? { outline: '2px dashed var(--accent)', outlineOffset: -8 } : undefined}
    >
      <Topbar
        actions={
          <>
            <input accept=".png,image/png" hidden onChange={handleFileChange} ref={fileInputRef} type="file" />
            <button
              className="btn"
              disabled={importMutation.isPending}
              onClick={handleImportClick}
              title="Импорт карточки PNG SillyTavern"
              type="button"
            >
              <UploadIcon size={13} /> {importMutation.isPending ? 'Импорт…' : 'Импорт'}
            </button>
            <Link className="btn btn--primary" to="/characters/new">
              <PlusIcon size={13} /> Новый персонаж
            </Link>
          </>
        }
        crumbs={[{ label: 'Персонажи', strong: true }]}
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">Персонажи</h1>
              <div className="page__sub">{subtitle}</div>
              {importErrorMessage ? (
                <div style={{ color: 'var(--danger)', fontSize: 'var(--fz-xs)', marginTop: 4 }}>
                  {importErrorMessage}
                </div>
              ) : null}
            </div>
            <div className="row gap-8">
              <div className="search" style={{ minWidth: 240 }}>
                <SearchIcon size={13} />
                <input
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  placeholder="Имя или файл…"
                  value={search}
                />
              </div>
              <div className="row gap-2 card" style={{ padding: 2 }}>
                <button
                  aria-pressed={viewMode === 'grid'}
                  className="btn btn--xs"
                  onClick={() => switchViewMode('grid')}
                  style={{ background: viewMode === 'grid' ? 'var(--surface-2)' : 'transparent' }}
                  title="Вид: сетка"
                  type="button"
                >
                  <GridIcon size={12} />
                </button>
                <button
                  aria-pressed={viewMode === 'list'}
                  className="btn btn--xs"
                  onClick={() => switchViewMode('list')}
                  style={{ background: viewMode === 'list' ? 'var(--surface-2)' : 'transparent' }}
                  title="Вид: список"
                  type="button"
                >
                  <ListIcon size={12} />
                </button>
              </div>
              <div className="row gap-2 card" style={{ padding: 2 }}>
                <button
                  className="btn btn--xs"
                  onClick={() => setSortMode((mode) => (mode === 'updated' ? 'name' : 'updated'))}
                  title={sortMode === 'updated' ? 'Сортировка: по дате' : 'Сортировка: по имени'}
                  type="button"
                >
                  <SortIcon size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="page__body">{body}</div>
      </div>
    </main>
  );
}

interface CharacterCardProps {
  character: CharacterSummaryDto;
}

function useCharacterActions(character: CharacterSummaryDto) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const startChatMutation = useMutation({
    mutationFn: () => createChat({ characterId: character.id }),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      await navigate({ to: '/chat/$chatId', params: { chatId: response.chat.id } });
    },
  });
  const deleteMutation = useDeleteCharacter(character.id, {
    onSuccess: () => {
      setConfirmDelete(false);
    },
  });

  return {
    confirmDelete,
    deleteMutation,
    handleAskDelete: () => setConfirmDelete(true),
    handleCancelDelete: () => setConfirmDelete(false),
    handleConfirmDelete: () => deleteMutation.mutate(),
    handleStartChat: () => startChatMutation.mutate(),
    startChatMutation,
  };
}

interface CharacterDeleteControlsProps {
  actions: ReturnType<typeof useCharacterActions>;
  darkOverlay?: boolean;
}

function CharacterDeleteControls({ actions, darkOverlay = false }: CharacterDeleteControlsProps) {
  const overlayStyle = darkOverlay ? { background: 'oklch(0 0 0 / 0.45)' } : undefined;

  if (actions.confirmDelete) {
    return (
      <>
        <button
          className="btn btn--xs btn--danger"
          disabled={actions.deleteMutation.isPending}
          onClick={actions.handleConfirmDelete}
          title="Удалить карточку без возможности восстановления"
          type="button"
        >
          {actions.deleteMutation.isPending ? '…' : 'Удалить'}
        </button>
        <button
          className="btn btn--icon btn--xs"
          disabled={actions.deleteMutation.isPending}
          onClick={actions.handleCancelDelete}
          style={overlayStyle}
          title="Не удалять"
          type="button"
        >
          <XIcon size={11} />
        </button>
      </>
    );
  }

  return (
    <button
      className="btn btn--icon btn--xs"
      onClick={actions.handleAskDelete}
      style={overlayStyle}
      title="Удалить карточку"
      type="button"
    >
      <TrashIcon size={11} />
    </button>
  );
}

function CharacterCard({ character }: CharacterCardProps) {
  const color = avatarColor(character.name);
  const initial = avatarInitial(character.name);
  const actions = useCharacterActions(character);
  // Подтверждение удаления остаётся видимым независимо от hover-состояния карточки.
  const confirmDeleteVisible = actions.confirmDelete;

  // Ссылка — оверлей поверх карточки, кнопки-действия подняты выше по z-index:
  // <button> внутри <a> — невалидный HTML.
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
        <span
          className="pill"
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            fontSize: 'var(--fz-2xs)',
            background: 'oklch(0 0 0 / 0.45)',
            color: 'oklch(1 0 0 / 0.85)',
            zIndex: 2,
          }}
        >
          {character.source.toUpperCase()}
        </span>
        <div
          className={confirmDeleteVisible ? undefined : 'char-card__actions'}
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

interface CharactersListTableProps {
  characters: CharacterSummaryDto[];
}

function CharactersListTable({ characters }: CharactersListTableProps) {
  return (
    <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Персонаж</th>
            <th>Чаты</th>
            <th>Изменён</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {characters.map((character) => (
            <CharacterListRow character={character} key={character.id} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CharacterListRow({ character }: CharacterCardProps) {
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
          <span className="muted mono" style={{ fontSize: 'var(--fz-2xs)' }} title={character.id}>
            {character.source.toUpperCase()}
          </span>
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
      <td style={{ textAlign: 'right' }}>
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

function CharactersGridSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
      {[0, 1, 2, 3, 4].map((index) => (
        <div className="card" key={index} style={{ aspectRatio: '3 / 4', padding: 0, background: 'var(--surface)' }} />
      ))}
    </div>
  );
}
