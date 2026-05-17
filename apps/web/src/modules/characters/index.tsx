import type { CharacterSummaryDto } from '@immersion/contracts/characters';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { type MouseEvent, useMemo, useState } from 'react';

import { Topbar } from '../../app/layout/topbar';
import { createApiUrl } from '../../shared/api/client';
import {
  ChatIcon,
  FilterIcon,
  LayersIcon,
  MoreIcon,
  PlusIcon,
  SearchIcon,
  SortIcon,
  UploadIcon,
} from '../../shared/ui/icons';
import { createChat } from '../chats/api/create-chat';
import { chatListQueryKey } from '../chats/queries/chat-list-query';
import { characterListQueryOptions } from './queries/character-list-query';

export { CharacterEditorScreen } from './editor';

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `oklch(0.45 0.1 ${hue})`;
}

function avatarInitial(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/u);
  if (words.length > 1 && words[1] && words[1].length > 0) {
    return `${words[0]?.charAt(0) ?? ''}${words[1].charAt(0)}`.toUpperCase();
  }
  return trimmed.charAt(0).toUpperCase();
}

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

export function CharactersScreen() {
  const query = useQuery(characterListQueryOptions());
  const [search, setSearch] = useState('');
  const items = query.data?.items ?? [];
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => item.name.toLowerCase().includes(needle));
  }, [items, search]);

  return (
    <main className="main">
      <Topbar
        actions={
          <>
            <button className="btn" disabled type="button">
              <UploadIcon size={13} /> Импорт
            </button>
            <Link className="btn btn--primary" to="/characters/new">
              <PlusIcon size={13} /> Новый персонаж
            </Link>
          </>
        }
        crumbs={[{ label: 'Персонажи', strong: true }]}
        search={false}
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">Персонажи</h1>
              <div className="page__sub">
                {query.isLoading
                  ? 'Загружаем карточки…'
                  : query.isError
                    ? 'Не удалось загрузить персонажей'
                    : `${items.length} карт${items.length === 1 ? 'а' : items.length >= 2 && items.length <= 4 ? 'ы' : ''} в библиотеке`}
              </div>
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
                <button className="btn btn--xs" style={{ background: 'var(--surface-2)' }} type="button">
                  <LayersIcon size={12} />
                </button>
                <button className="btn btn--xs" disabled type="button">
                  <SortIcon size={12} />
                </button>
              </div>
              <button className="btn btn--ghost-bordered" disabled type="button">
                <FilterIcon size={13} /> Фильтр
              </button>
            </div>
          </div>
        </div>
        <div className="page__body">
          {query.isLoading ? (
            <CharactersGridSkeleton />
          ) : query.isError ? (
            <div className="empty">
              <h2>Не удалось загрузить карточки</h2>
              <p>Проверьте rewrite API и повторите попытку.</p>
            </div>
          ) : items.length === 0 ? (
            <div className="empty">
              <h2>Папка персонажей пуста</h2>
              <p>
                Поместите .png-карточки или .json-файлы в <code>data/characters/</code> и обновите страницу.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <h2>Ничего не найдено</h2>
              <p>Поиск не дал совпадений по имени файла.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14 }}>
              {filtered.map((character) => (
                <CharacterCard character={character} key={character.id} />
              ))}
            </div>
          )}
        </div>
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
  const startChatMutation = useMutation({
    mutationFn: () => createChat({ characterId: character.id }),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      await navigate({ to: '/chat/$chatId', params: { chatId: response.chat.id } });
    },
  });

  const handleStartChat = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    startChatMutation.mutate();
  };

  return (
    <Link
      className="card card-hover"
      params={{ characterId: character.id }}
      style={{
        padding: 0,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        textDecoration: 'none',
        color: 'inherit',
      }}
      to="/characters/$characterId"
    >
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
        <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 4 }}>
          <button className="btn btn--icon btn--xs" disabled style={{ background: 'oklch(0 0 0 / 0.4)' }} type="button">
            <MoreIcon size={11} />
          </button>
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
          title="Начать новый чат с этим персонажем"
          type="button"
        >
          <ChatIcon size={11} /> {startChatMutation.isPending ? '…' : 'Чат'}
        </button>
      </div>
    </Link>
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
