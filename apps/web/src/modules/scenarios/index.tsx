import type { ScenarioSummaryDto } from '@immersion/contracts/scenarios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { type MouseEvent, useMemo, useState } from 'react';

import { Topbar } from '../../app/layout/topbar';
import { PlusIcon, SearchIcon, UploadIcon } from '../../shared/ui/icons';
import { createChat } from '../chats/api/create-chat';
import { chatListQueryKey } from '../chats/queries/chat-list-query';
import { scenarioListQueryOptions } from './queries/scenario-list-query';

export { ScenarioEditorScreen } from './editor';

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

export function ScenariosScreen() {
  const query = useQuery(scenarioListQueryOptions());
  const [search, setSearch] = useState('');
  const items = query.data?.items ?? [];
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
      const haystack = [item.name, item.preview ?? '', item.concept ?? '', ...item.tags].join(' ').toLowerCase();
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
            <Link className="btn btn--primary" to="/scenarios/new">
              <PlusIcon size={13} /> Новый сценарий
            </Link>
          </>
        }
        crumbs={[{ label: 'Сценарии', strong: true }]}
        search={false}
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">Сценарии</h1>
              <div className="page__sub">
                {query.isLoading
                  ? 'Загружаем сценарии…'
                  : query.isError
                    ? 'Не удалось загрузить сценарии'
                    : `${items.length} сценари${items.length === 1 ? 'й' : items.length >= 2 && items.length <= 4 ? 'я' : 'ев'} в библиотеке`}
              </div>
            </div>
            <div className="row gap-8">
              <div className="search" style={{ minWidth: 280 }}>
                <SearchIcon size={13} />
                <input
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  placeholder="Имя, концепт, тег…"
                  value={search}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="page__body">
          {query.isLoading ? (
            <ScenariosListSkeleton />
          ) : query.isError ? (
            <div className="empty">
              <h2>Не удалось загрузить сценарии</h2>
              <p>Проверьте rewrite API и повторите попытку.</p>
            </div>
          ) : items.length === 0 ? (
            <div className="empty">
              <h2>Папка сценариев пуста</h2>
              <p>
                Положите .json-файлы в <code>data/scenarios/</code> и обновите страницу.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <h2>Ничего не найдено</h2>
              <p>Поиск не дал совпадений по имени, концепту или тегам.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {filtered.map((scenario) => (
                <ScenarioRow key={scenario.id} scenario={scenario} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

interface ScenarioRowProps {
  scenario: ScenarioSummaryDto;
}

function ScenarioRow({ scenario }: ScenarioRowProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const startChatMutation = useMutation({
    mutationFn: () => createChat({ scenarioId: scenario.id }),
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
      params={{ scenarioId: scenario.id }}
      style={{
        padding: 14,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 120px',
        gap: 18,
        textDecoration: 'none',
        color: 'inherit',
      }}
      to="/scenarios/$scenarioId"
    >
      <div style={{ minWidth: 0, display: 'grid', gap: 6 }}>
        <strong style={{ fontSize: 'var(--fz-md)' }}>{scenario.name}</strong>
        {scenario.preview ? (
          <div
            className="muted"
            style={{
              fontSize: 'var(--fz-sm)',
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {scenario.preview}
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 'var(--fz-sm)' }}>
            Без описания.
          </div>
        )}
        {scenario.tags.length > 0 ? (
          <div className="row gap-4" style={{ flexWrap: 'wrap' }}>
            {scenario.tags.slice(0, 8).map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="col" style={{ alignItems: 'flex-end', gap: 6, justifyContent: 'space-between' }}>
        <span className="muted mono" style={{ fontSize: 'var(--fz-xs)' }}>
          {formatRelative(scenario.updatedAt)}
        </span>
        <button
          className="btn btn--xs btn--primary"
          disabled={startChatMutation.isPending}
          onClick={handleStartChat}
          title="Начать новый чат по сценарию"
          type="button"
        >
          {startChatMutation.isPending ? '…' : 'Начать чат'}
        </button>
      </div>
    </Link>
  );
}

function ScenariosListSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {[0, 1, 2].map((index) => (
        <div className="card" key={index} style={{ height: 110, background: 'var(--surface)' }} />
      ))}
    </div>
  );
}
