import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { type ChangeEvent, type DragEvent, type ReactNode, useMemo, useRef, useState } from 'react';

import { Topbar } from '../../app/layout/topbar';
import { getApiErrorMessage } from '../../shared/api/get-api-error-message';
import { pluralRu } from '../../shared/lib/plural';
import { readFileAsBase64 } from '../../shared/lib/read-file-as-base64';
import { GridIcon, ListIcon, PlusIcon, SearchIcon, SortIcon, UploadIcon } from '../../shared/ui/icons';
import { importCharacterCard } from './api/import-character-card';
import { CharacterCard } from './components/character-card';
import { CharactersGridSkeleton } from './components/characters-grid-skeleton';
import { CharactersListTable } from './components/characters-list-table';
import { characterListQueryKey, characterListQueryOptions } from './queries/character-list-query';

export { CharacterEditorScreen } from './editor';

function characterCardsLabel(count: number): string {
  return `${pluralRu(count, ['карта', 'карты', 'карт'])} в библиотеке`;
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
    const nextTarget = event.relatedTarget as Node | null;
    const pointerLeftWindow = nextTarget === null;
    if (pointerLeftWindow || !event.currentTarget.contains(nextTarget)) {
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
