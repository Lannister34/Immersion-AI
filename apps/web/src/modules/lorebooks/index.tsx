import {
  type LorebookSummaryDto,
  type SaveLorebookCommand,
  SaveLorebookCommandSchema,
} from '@immersion/contracts/lorebooks';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { type ChangeEvent, type MouseEvent, useMemo, useRef, useState } from 'react';

import { Topbar } from '../../app/layout/topbar';
import { ApiError } from '../../shared/api/client';
import { formatRelative } from '../../shared/lib/format-relative';
import { BookIcon, PlusIcon, SearchIcon, TrashIcon, UploadIcon, XIcon } from '../../shared/ui/icons';
import { createLorebook } from './api/save-lorebook';
import { useDeleteLorebook } from './mutations/use-delete-lorebook';
import { lorebookListQueryKey, lorebookListQueryOptions } from './queries/lorebook-list-query';

export { LorebookEditorScreen } from './editor';

function normalizeLorebookEntry(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  return {
    content: typeof record.content === 'string' ? record.content : '',
    enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
    keys: Array.isArray(record.keys ?? record.key)
      ? ((record.keys ?? record.key) as unknown[]).filter((key): key is string => typeof key === 'string')
      : typeof record.key === 'string'
        ? [record.key]
        : [],
    priority:
      typeof record.priority === 'number' ? record.priority : typeof record.order === 'number' ? record.order : 0,
  };
}

function parseLorebookImportFile(raw: string): SaveLorebookCommand {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Файл лорбука должен содержать JSON-объект.');
  }
  const record = parsed as Record<string, unknown>;
  const entriesRaw = Array.isArray(record.entries)
    ? record.entries
    : record.entries && typeof record.entries === 'object'
      ? Object.values(record.entries as Record<string, unknown>)
      : [];
  const entries = entriesRaw
    .map((entry) => normalizeLorebookEntry(entry))
    .filter((entry): entry is NonNullable<ReturnType<typeof normalizeLorebookEntry>> => entry !== null);
  return SaveLorebookCommandSchema.parse({
    entries,
    name: typeof record.name === 'string' ? record.name : '',
    tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  });
}

export function LorebooksScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery(lorebookListQueryOptions());
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<readonly string[]>([]);
  const [sortMode, setSortMode] = useState<'updated' | 'name' | 'entries'>('updated');
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const command = parseLorebookImportFile(text);
      return createLorebook(command);
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: lorebookListQueryKey });
      await navigate({ to: '/lorebooks/$lorebookId', params: { lorebookId: response.lorebook.id } });
    },
  });
  const handleImportClick = () => importInputRef.current?.click();
  const handleImportFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setImportError(null);
    importMutation.mutate(file, {
      onError: (error) => {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Не удалось импортировать лорбук.';
        setImportError(message);
      },
    });
  };

  const items = query.data?.items ?? [];
  const tagCloud = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      for (const tag of item.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 12);
  }, [items]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filteredItems = items.filter((item) => {
      if (activeTags.length > 0 && !activeTags.every((tag) => item.tags.includes(tag))) return false;
      if (!needle) return true;
      const haystack = [item.name, ...item.tags].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
    const collator = new Intl.Collator('ru');
    return [...filteredItems].sort((left, right) => {
      if (sortMode === 'name') return collator.compare(left.name, right.name);
      if (sortMode === 'entries') return right.entryCount - left.entryCount;
      return right.updatedAt.localeCompare(left.updatedAt);
    });
  }, [items, search, activeTags, sortMode]);

  const toggleTag = (tag: string) => {
    setActiveTags((current) => (current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag]));
  };

  const sortLabel = sortMode === 'updated' ? 'Активность ↓' : sortMode === 'name' ? 'По имени' : 'По записям';
  const handleCycleSort = () => {
    setSortMode((mode) => (mode === 'updated' ? 'name' : mode === 'name' ? 'entries' : 'updated'));
  };

  return (
    <main className="main">
      <Topbar
        actions={
          <>
            <input
              accept=".json,application/json"
              hidden
              onChange={handleImportFileChange}
              ref={importInputRef}
              type="file"
            />
            <button
              className="btn"
              disabled={importMutation.isPending}
              onClick={handleImportClick}
              title="Импорт .json-лорбука"
              type="button"
            >
              <UploadIcon size={13} /> {importMutation.isPending ? 'Импорт…' : 'Импорт'}
            </button>
            <Link className="btn btn--primary" to="/lorebooks/new">
              <PlusIcon size={13} /> Новый лорбук
            </Link>
          </>
        }
        crumbs={[{ label: 'Лорбуки', strong: true }]}
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">Лорбуки</h1>
              <div className="page__sub">
                {query.isLoading
                  ? 'Загружаем лорбуки…'
                  : query.isError
                    ? 'Не удалось загрузить лорбуки'
                    : `${items.length} лорбук${items.length === 1 ? '' : items.length >= 2 && items.length <= 4 ? 'а' : 'ов'} в библиотеке`}
              </div>
              {importError ? (
                <div style={{ color: 'var(--danger)', fontSize: 'var(--fz-xs)', marginTop: 4 }}>{importError}</div>
              ) : null}
            </div>
            <div className="row gap-8">
              <div className="search" style={{ minWidth: 280 }}>
                <SearchIcon size={13} />
                <input
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  placeholder="Имя или ключ…"
                  value={search}
                />
              </div>
              <button className="btn btn--ghost-bordered" onClick={handleCycleSort} type="button">
                {sortLabel}
              </button>
            </div>
          </div>
          {tagCloud.length > 0 ? (
            <div className="filters" style={{ marginTop: 8 }}>
              <button
                aria-pressed={activeTags.length === 0}
                className="filter-chip"
                data-active={activeTags.length === 0 ? 'true' : 'false'}
                onClick={() => setActiveTags([])}
                type="button"
              >
                Все
              </button>
              {tagCloud.map(([tag, count]) => (
                <button
                  aria-pressed={activeTags.includes(tag)}
                  className="filter-chip"
                  data-active={activeTags.includes(tag) ? 'true' : 'false'}
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  type="button"
                >
                  {tag} <span className="dim">{count}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="page__body">
          {query.isLoading ? (
            <div className="empty">
              <p className="muted">Загружаем…</p>
            </div>
          ) : query.isError ? (
            <div className="empty">
              <h2>Не удалось загрузить лорбуки</h2>
              <p>Проверьте rewrite API и повторите попытку.</p>
            </div>
          ) : items.length === 0 ? (
            <div className="empty">
              <h2>Папка лорбуков пуста</h2>
              <p>
                Создайте новый лорбук или положите .json-файлы в <code>data/worlds/</code>.
              </p>
              <div className="row gap-8" style={{ marginTop: 12, justifyContent: 'center' }}>
                <Link className="btn btn--primary" to="/lorebooks/new">
                  <PlusIcon size={13} /> Новый лорбук
                </Link>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <h2>Ничего не найдено</h2>
              <p>Поиск не дал совпадений по имени или тегам.</p>
            </div>
          ) : (
            <div
              className="card"
              style={{ padding: 0, overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto 1fr' }}
            >
              <div
                className="row gap-12"
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--hairline)',
                  fontSize: 'var(--fz-xs)',
                  color: 'var(--muted)',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) 80px minmax(0, 1fr) 120px 100px',
                  gap: 14,
                }}
              >
                <span>Название</span>
                <span>Записей</span>
                <span>Теги</span>
                <span>Изменён</span>
                <span />
              </div>
              <div>
                {filtered.map((lorebook) => (
                  <LorebookRow key={lorebook.id} lorebook={lorebook} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

interface LorebookRowProps {
  lorebook: LorebookSummaryDto;
}

function LorebookRow({ lorebook }: LorebookRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteMutation = useDeleteLorebook(lorebook.id, {
    onSuccess: () => {
      setConfirmDelete(false);
    },
  });

  const handleAskDelete = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setConfirmDelete(true);
  };

  const handleConfirmDelete = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    deleteMutation.mutate();
  };

  const handleCancelDelete = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setConfirmDelete(false);
  };

  return (
    <Link
      params={{ lorebookId: lorebook.id }}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 80px minmax(0, 1fr) 120px 100px',
        gap: 14,
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid var(--hairline)',
        background: 'var(--bg)',
        color: 'inherit',
        textDecoration: 'none',
      }}
      to="/lorebooks/$lorebookId"
    >
      <div className="row gap-8" style={{ minWidth: 0 }}>
        <BookIcon size={13} stroke="var(--muted)" />
        <strong className="truncate" style={{ fontSize: 'var(--fz-md)' }}>
          {lorebook.name}
        </strong>
      </div>
      <span className="mono tnum" style={{ fontSize: 'var(--fz-sm)', color: 'var(--text-1)' }}>
        {lorebook.entryCount}
      </span>
      <div className="row gap-4" style={{ flexWrap: 'wrap', minWidth: 0 }}>
        {lorebook.tags.slice(0, 4).map((tag) => (
          <span className="tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <span className="muted mono" style={{ fontSize: 'var(--fz-xs)' }}>
        {formatRelative(lorebook.updatedAt)}
      </span>
      <div className="row gap-4" style={{ justifyContent: 'flex-end' }}>
        {confirmDelete ? (
          <>
            <button
              className="btn btn--xs btn--danger"
              disabled={deleteMutation.isPending}
              onClick={handleConfirmDelete}
              title="Удалить лорбук"
              type="button"
            >
              {deleteMutation.isPending ? '…' : 'Удалить'}
            </button>
            <button
              className="btn btn--icon btn--xs"
              disabled={deleteMutation.isPending}
              onClick={handleCancelDelete}
              title="Не удалять"
              type="button"
            >
              <XIcon size={11} />
            </button>
          </>
        ) : (
          <button className="btn btn--icon btn--xs" onClick={handleAskDelete} title="Удалить лорбук" type="button">
            <TrashIcon size={11} />
          </button>
        )}
      </div>
    </Link>
  );
}
