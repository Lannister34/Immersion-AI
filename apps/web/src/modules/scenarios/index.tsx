import {
  type SaveScenarioCommand,
  SaveScenarioCommandSchema,
  type ScenarioSummaryDto,
} from '@immersion/contracts/scenarios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { type ChangeEvent, type ReactNode, useMemo, useRef, useState } from 'react';

import { Topbar } from '../../app/layout/topbar';
import { formatRelative } from '../../shared/lib/format-relative';
import { pluralRu } from '../../shared/lib/plural';
import { PlusIcon, SearchIcon, TrashIcon, UploadIcon, XIcon } from '../../shared/ui/icons';
import { createChat } from '../chats/api/create-chat';
import { chatListQueryKey } from '../chats/queries/chat-list-query';
import { createScenario } from './api/save-scenario';
import { useDeleteScenario } from './mutations/use-delete-scenario';
import { scenarioListQueryKey, scenarioListQueryOptions } from './queries/scenario-list-query';

export { ScenarioEditorScreen } from './editor';

function scenarioCountLabel(count: number): string {
  return `${pluralRu(count, ['сценарий', 'сценария', 'сценариев'])} в библиотеке`;
}

function parseScenarioImportFile(raw: string): SaveScenarioCommand {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Файл сценария должен содержать JSON-объект.');
  }
  const record = parsed as Record<string, unknown>;
  return SaveScenarioCommandSchema.parse({
    concept: typeof record.concept === 'string' ? record.concept : '',
    content: typeof record.content === 'string' ? record.content : '',
    firstMessage: typeof record.firstMessage === 'string' ? record.firstMessage : '',
    name: typeof record.name === 'string' ? record.name : '',
    tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  });
}

export function ScenariosScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery(scenarioListQueryOptions());
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<readonly string[]>([]);
  const [sortMode, setSortMode] = useState<'updated' | 'name'>('updated');
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const command = parseScenarioImportFile(text);
      return createScenario(command);
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: scenarioListQueryKey });
      await navigate({ to: '/scenarios/$scenarioId', params: { scenarioId: response.scenario.id } });
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
        // ApiError наследует Error — сообщение берём из любого Error, включая ошибки парсинга файла.
        setImportError(error instanceof Error ? error.message : 'Не удалось импортировать сценарий.');
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
    const tagFilter = activeTags;
    const filteredItems = items.filter((item) => {
      if (tagFilter.length > 0 && !tagFilter.every((tag) => item.tags.includes(tag))) return false;
      if (!needle) return true;
      const haystack = [item.name, item.preview ?? '', item.concept ?? '', ...item.tags].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
    const collator = new Intl.Collator('ru');
    return [...filteredItems].sort((left, right) => {
      if (sortMode === 'name') return collator.compare(left.name, right.name);
      return right.updatedAt.localeCompare(left.updatedAt);
    });
  }, [items, search, activeTags, sortMode]);

  const toggleTag = (tag: string) => {
    setActiveTags((current) => (current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag]));
  };

  let subtitle = scenarioCountLabel(items.length);
  if (query.isLoading) {
    subtitle = 'Загружаем сценарии…';
  } else if (query.isError) {
    subtitle = 'Не удалось загрузить сценарии';
  }

  let body: ReactNode;
  if (query.isLoading) {
    body = <ScenariosListSkeleton />;
  } else if (query.isError) {
    body = (
      <div className="empty">
        <h2>Не удалось загрузить сценарии</h2>
        <p>Проверьте rewrite API и повторите попытку.</p>
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <div className="empty">
        <h2>Папка сценариев пуста</h2>
        <p>
          Создайте новый сценарий или положите .json-файлы в <code>data/scenarios/</code>.
        </p>
        <div className="row gap-8" style={{ marginTop: 12, justifyContent: 'center' }}>
          <Link className="btn btn--primary" to="/scenarios/new">
            <PlusIcon size={13} /> Новый сценарий
          </Link>
        </div>
      </div>
    );
  } else if (filtered.length === 0) {
    body = (
      <div className="empty">
        <h2>Ничего не найдено</h2>
        <p>Поиск не дал совпадений по имени, концепту или тегам.</p>
      </div>
    );
  } else {
    body = (
      <div style={{ display: 'grid', gap: 10 }}>
        {filtered.map((scenario) => (
          <ScenarioRow key={scenario.id} scenario={scenario} />
        ))}
      </div>
    );
  }

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
              title="Импорт .json-сценария"
              type="button"
            >
              <UploadIcon size={13} /> {importMutation.isPending ? 'Импорт…' : 'Импорт'}
            </button>
            <Link className="btn btn--primary" to="/scenarios/new">
              <PlusIcon size={13} /> Новый сценарий
            </Link>
          </>
        }
        crumbs={[{ label: 'Сценарии', strong: true }]}
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">Сценарии</h1>
              <div className="page__sub">{subtitle}</div>
              {importError ? (
                <div style={{ color: 'var(--danger)', fontSize: 'var(--fz-xs)', marginTop: 4 }}>{importError}</div>
              ) : null}
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
              <button
                className="btn btn--ghost-bordered"
                onClick={() => setSortMode((mode) => (mode === 'updated' ? 'name' : 'updated'))}
                type="button"
              >
                {sortMode === 'updated' ? 'Активность ↓' : 'По имени'}
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
        <div className="page__body">{body}</div>
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const startChatMutation = useMutation({
    mutationFn: () => createChat({ scenarioId: scenario.id }),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      await navigate({ to: '/chat/$chatId', params: { chatId: response.chat.id } });
    },
  });
  const deleteMutation = useDeleteScenario(scenario.id, {
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

  // Ссылка — оверлей поверх строки, кнопки-действия подняты выше по z-index:
  // <button> внутри <a> — невалидный HTML.
  return (
    <div
      className="card card-hover"
      style={{
        padding: 14,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 140px',
        gap: 18,
        position: 'relative',
      }}
    >
      <Link
        aria-label={`Открыть сценарий: ${scenario.name}`}
        params={{ scenarioId: scenario.id }}
        style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'pointer' }}
        to="/scenarios/$scenarioId"
      />
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
        <div className="row gap-4" style={{ position: 'relative', zIndex: 2 }}>
          {confirmDelete ? (
            <>
              <button
                className="btn btn--xs btn--danger"
                disabled={deleteMutation.isPending}
                onClick={handleConfirmDelete}
                title="Удалить сценарий"
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
            <>
              <button
                className="btn btn--icon btn--xs"
                onClick={handleAskDelete}
                title="Удалить сценарий"
                type="button"
              >
                <TrashIcon size={11} />
              </button>
              <button
                className="btn btn--xs btn--primary"
                disabled={startChatMutation.isPending}
                onClick={handleStartChat}
                title="Начать новый чат по сценарию"
                type="button"
              >
                {startChatMutation.isPending ? '…' : 'Начать чат'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
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
