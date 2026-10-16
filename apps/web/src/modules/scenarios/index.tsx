import { type SaveScenarioCommand, SaveScenarioCommandSchema } from '@immersion/contracts/scenarios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { type ChangeEvent, type ReactNode, useMemo, useRef, useState } from 'react';

import { Topbar } from '../../app/layout/topbar';
import { pluralRu } from '../../shared/lib/plural';
import { PlusIcon, SearchIcon, UploadIcon } from '../../shared/ui/icons';
import { createScenario } from './api/save-scenario';
import { ScenarioRow } from './components/scenario-row';
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

const SCENARIO_SKELETON_CARD_COUNT = 3;

function ScenariosListSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {Array.from({ length: SCENARIO_SKELETON_CARD_COUNT }, (_, index) => (
        <div className="card" key={index} style={{ height: 110, background: 'var(--surface)' }} />
      ))}
    </div>
  );
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
