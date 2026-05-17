import type { LorebookSummaryDto } from '@immersion/contracts/lorebooks';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

import { Topbar } from '../../app/layout/topbar';
import { BookIcon, MoreIcon, PlusIcon, SearchIcon, UploadIcon } from '../../shared/ui/icons';
import { lorebookListQueryOptions } from './queries/lorebook-list-query';

export { LorebookEditorScreen } from './editor';

function formatRelative(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);
  if (diffDays === 0) return 'сегодня';
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} д`;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

export function LorebooksScreen() {
  const query = useQuery(lorebookListQueryOptions());
  const [search, setSearch] = useState('');
  const items = query.data?.items ?? [];
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
      const haystack = [item.name, ...item.tags].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, search]);

  return (
    <main className="main">
      <Topbar
        actions={
          <>
            <button className="btn" disabled type="button">
              <UploadIcon size={13} /> Импорт
            </button>
            <Link className="btn btn--primary" to="/lorebooks/new">
              <PlusIcon size={13} /> Новый лорбук
            </Link>
          </>
        }
        crumbs={[{ label: 'Лорбуки', strong: true }]}
        search={false}
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
            </div>
          </div>
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
                Положите .json-файлы в <code>data/worlds/</code> и обновите страницу.
              </p>
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
                  gridTemplateColumns: 'minmax(0, 1fr) 80px minmax(0, 1fr) 120px 40px',
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
  return (
    <Link
      params={{ lorebookId: lorebook.id }}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 80px minmax(0, 1fr) 120px 40px',
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
      <button className="btn btn--icon btn--xs" disabled onClick={(event) => event.preventDefault()} type="button">
        <MoreIcon size={12} />
      </button>
    </Link>
  );
}
