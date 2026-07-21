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
import { ChatIcon, PlusIcon, SearchIcon, SortIcon, TrashIcon, UploadIcon, XIcon } from '../../shared/ui/icons';
import { createChat } from '../chats/api/create-chat';
import { chatListQueryKey } from '../chats/queries/chat-list-query';
import { importCharacterCard } from './api/import-character-card';
import { useDeleteCharacter } from './mutations/use-delete-character';
import { characterListQueryKey, characterListQueryOptions } from './queries/character-list-query';

export { CharacterEditorScreen } from './editor';

function characterCardsLabel(count: number): string {
  return `${pluralRu(count, ['карта', 'карты', 'карт'])} в библиотеке`;
}

export function CharactersScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery(characterListQueryOptions());
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<'updated' | 'name'>('updated');
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
  } else {
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14 }}>
        {filtered.map((character) => (
          <CharacterCard character={character} key={character.id} />
        ))}
      </div>
    );
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

function CharacterCard({ character }: CharacterCardProps) {
  const color = avatarColor(character.name);
  const initial = avatarInitial(character.name);
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

  const handleStartChat = () => {
    startChatMutation.mutate();
  };

  const handleAskDelete = () => {
    setConfirmDelete(true);
  };

  const handleConfirmDelete = () => {
    deleteMutation.mutate();
  };

  const handleCancelDelete = () => {
    setConfirmDelete(false);
  };

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
          aspectRatio: '16 / 9',
          background: character.avatarUrl
            ? `linear-gradient(180deg, transparent 40%, oklch(0.15 0.005 270 / 0.9)), center / cover no-repeat url("${createApiUrl(character.avatarUrl)}"), ${color}`
            : `linear-gradient(180deg, transparent 40%, oklch(0.15 0.005 270 / 0.9)), ${color}`,
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          padding: 14,
        }}
      >
        <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 4, zIndex: 2 }}>
          {confirmDelete ? (
            <>
              <button
                className="btn btn--xs btn--danger"
                disabled={deleteMutation.isPending}
                onClick={handleConfirmDelete}
                title="Удалить карточку без возможности восстановления"
                type="button"
              >
                {deleteMutation.isPending ? '…' : 'Удалить'}
              </button>
              <button
                className="btn btn--icon btn--xs"
                disabled={deleteMutation.isPending}
                onClick={handleCancelDelete}
                style={{ background: 'oklch(0 0 0 / 0.4)' }}
                title="Не удалять"
                type="button"
              >
                <XIcon size={11} />
              </button>
            </>
          ) : (
            <button
              className="btn btn--icon btn--xs"
              onClick={handleAskDelete}
              style={{ background: 'oklch(0 0 0 / 0.4)' }}
              title="Удалить карточку"
              type="button"
            >
              <TrashIcon size={11} />
            </button>
          )}
        </div>
        {!character.avatarUrl ? (
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'oklch(0 0 0 / 0.35)',
              border: '1px solid oklch(1 0 0 / 0.15)',
              display: 'grid',
              placeItems: 'center',
              color: 'white',
              fontSize: 'var(--fz-lg)',
              fontWeight: 600,
            }}
          >
            {initial}
          </div>
        ) : null}
      </div>
      <div style={{ padding: 12, display: 'grid', gap: 6 }}>
        <strong style={{ fontSize: 'var(--fz-md)' }}>{character.name}</strong>
        <div className="muted" style={{ fontSize: 'var(--fz-xs)', fontFamily: 'var(--font-mono)' }}>
          {character.source.toUpperCase()} · {character.id}
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
          disabled={startChatMutation.isPending}
          onClick={handleStartChat}
          style={{ position: 'relative', zIndex: 2 }}
          title="Начать новый чат с этим персонажем"
          type="button"
        >
          <ChatIcon size={11} /> {startChatMutation.isPending ? '…' : 'Чат'}
        </button>
      </div>
    </div>
  );
}

function CharactersGridSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14 }}>
      {[0, 1, 2].map((index) => (
        <div className="card" key={index} style={{ aspectRatio: '4 / 3', padding: 0, background: 'var(--surface)' }} />
      ))}
    </div>
  );
}
