import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { type ChangeEvent, type ReactNode, useDeferredValue, useMemo, useRef, useState } from 'react';

import { Topbar } from '../../../app/layout/topbar';
import { ApiError } from '../../../shared/api/client';
import { formatRelative } from '../../../shared/lib/format-relative';
import { pluralRu } from '../../../shared/lib/plural';
import { readFileAsBase64 } from '../../../shared/lib/read-file-as-base64';
import { PlusIcon, SearchIcon, SortIcon, UploadIcon } from '../../../shared/ui/icons';
import { createChat } from '../api/create-chat';
import { importChat } from '../api/import-chat';
import { chatListQueryKey, chatListQueryOptions } from '../queries/chat-list-query';
import { ChatListRow } from './chat-list-row';

const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

class ImportFileTooLargeError extends Error {
  constructor() {
    super('Import file exceeds the 10 MB limit.');
    this.name = 'ImportFileTooLargeError';
  }
}

interface ImportNotice {
  chatId: string;
  importedMessages: number;
  skippedLines: number;
}

function getImportErrorMessage(error: unknown): string {
  if (error instanceof ImportFileTooLargeError) {
    return 'Файл больше 10 МБ — импорт невозможен.';
  }
  if (error instanceof ApiError) {
    if (error.code === 'invalid_chat_file') {
      return 'Файл не похож на экспорт чата: в нём не нашлось ни одного сообщения.';
    }
    if (error.code === 'chat_file_too_large') {
      return 'Файл слишком большой: лимит импорта — 10 МБ.';
    }
  }
  return 'Не удалось импортировать чат. Проверьте файл и повторите попытку.';
}

export function ChatListScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState('');
  const [characterFilter, setCharacterFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'updated' | 'name'>('updated');
  const [importNotice, setImportNotice] = useState<ImportNotice | null>(null);
  const deferredSearch = useDeferredValue(search);
  const chatListQuery = useQuery(chatListQueryOptions(deferredSearch));
  const createMutation = useMutation({
    mutationFn: createChat,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      await navigate({ to: '/chat/$chatId', params: { chatId: response.chat.id } });
    },
  });
  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      // Проверка до кодирования: base64 большого файла зря нагружает вкладку,
      // а сервер всё равно ответит 413.
      if (file.size > MAX_IMPORT_FILE_BYTES) {
        throw new ImportFileTooLargeError();
      }
      const contentBase64 = await readFileAsBase64(file);
      return importChat({ contentBase64 });
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      if (response.skippedLines === 0) {
        await navigate({ to: '/chat/$chatId', params: { chatId: response.chat.id } });
        return;
      }
      // Частичный импорт: не уводим со списка молча, а показываем, что пропущено.
      setImportNotice({
        chatId: response.chat.id,
        importedMessages: response.importedMessages,
        skippedLines: response.skippedLines,
      });
    },
  });

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setImportNotice(null);
    importMutation.mutate(file);
  };

  const allItems = chatListQuery.data?.items ?? [];

  const characterCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of allItems) {
      const key = item.characterName ?? 'Свободный';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).slice(0, 6);
  }, [allItems]);

  const filtered = useMemo(() => {
    const filteredItems = characterFilter
      ? allItems.filter((item) => (item.characterName ?? 'Свободный') === characterFilter)
      : allItems;
    const collator = new Intl.Collator('ru');
    return [...filteredItems].sort((left, right) => {
      if (sortMode === 'name') return collator.compare(left.title, right.title);
      return right.updatedAt.localeCompare(left.updatedAt);
    });
  }, [allItems, characterFilter, sortMode]);

  const lastUpdated = allItems[0]?.updatedAt;

  let body: ReactNode;
  if (chatListQuery.isLoading) {
    body = <ChatListSkeleton />;
  } else if (chatListQuery.isError) {
    body = (
      <div className="empty">
        <h2>Не удалось загрузить чаты</h2>
        <p>Проверьте rewrite API и повторите попытку.</p>
      </div>
    );
  } else if (filtered.length === 0) {
    body = (
      <div className="empty">
        <h2>{allItems.length === 0 ? 'Пока нет ни одного чата' : 'Ничего не найдено'}</h2>
        <p>
          {allItems.length === 0
            ? 'Запустите свободный чат или начните разговор с готовым персонажем или сценарием.'
            : 'Попробуйте изменить запрос или сбросить фильтры.'}
        </p>
        {allItems.length === 0 ? (
          <div className="row gap-8" style={{ marginTop: 12, justifyContent: 'center' }}>
            <button
              className="btn btn--primary"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate({})}
              type="button"
            >
              <PlusIcon size={13} /> Свободный чат
            </button>
            <Link className="btn" to="/characters">
              Выбрать персонажа
            </Link>
            <Link className="btn" to="/scenarios">
              Выбрать сценарий
            </Link>
          </div>
        ) : null}
      </div>
    );
  } else {
    body = (
      <div
        style={{
          display: 'grid',
          gap: 1,
          background: 'var(--hairline)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--r-md)',
          overflow: 'hidden',
        }}
      >
        {filtered.map((chat) => (
          <ChatListRow chat={chat} key={chat.id} />
        ))}
      </div>
    );
  }

  return (
    <main className="main">
      <Topbar
        crumbs={[{ label: 'Чаты', strong: true }]}
        actions={
          <>
            <input
              accept=".jsonl,.json,application/x-ndjson,application/json"
              hidden
              onChange={handleImportFileChange}
              ref={importInputRef}
              type="file"
            />
            <button
              className="btn"
              disabled={importMutation.isPending}
              onClick={handleImportClick}
              title="Импорт чата из файла .jsonl"
              type="button"
            >
              <UploadIcon size={13} /> {importMutation.isPending ? 'Импорт…' : 'Импорт'}
            </button>
            <button
              className="btn btn--primary"
              disabled={createMutation.isPending}
              onClick={() => {
                createMutation.mutate({});
              }}
              type="button"
            >
              <PlusIcon size={13} /> Новый чат
            </button>
          </>
        }
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">Чаты</h1>
              <div className="page__sub">
                {chatListQuery.isLoading
                  ? 'Загружаем сессии…'
                  : pluralRu(allItems.length, ['чат', 'чата', 'чатов']) +
                    (lastUpdated ? ` · последняя активность ${formatRelative(lastUpdated)}` : '')}
              </div>
              {importMutation.isError ? (
                <div style={{ color: 'var(--danger)', fontSize: 'var(--fz-xs)', marginTop: 4 }}>
                  {getImportErrorMessage(importMutation.error)}
                </div>
              ) : null}
              {importNotice ? (
                <div className="row gap-8" style={{ alignItems: 'center', fontSize: 'var(--fz-xs)', marginTop: 4 }}>
                  <span>
                    Импортировано {importNotice.importedMessages} сообщений, {importNotice.skippedLines} строк пропущено
                    (не распознаны).
                  </span>
                  <button
                    className="btn"
                    onClick={() => {
                      void navigate({ to: '/chat/$chatId', params: { chatId: importNotice.chatId } });
                    }}
                    type="button"
                  >
                    Открыть чат
                  </button>
                </div>
              ) : null}
            </div>
            <div className="row gap-8">
              <div className="search" style={{ minWidth: 280 }}>
                <SearchIcon size={13} />
                <input
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  placeholder="Поиск по названию и тексту…"
                  value={search}
                />
              </div>
              <button
                className="btn btn--ghost-bordered"
                onClick={() => setSortMode((mode) => (mode === 'updated' ? 'name' : 'updated'))}
                type="button"
              >
                <SortIcon size={13} /> {sortMode === 'updated' ? 'Активность ↓' : 'По имени'}
              </button>
            </div>
          </div>
          {characterCounts.length > 0 ? (
            <div className="filters">
              <button
                aria-pressed={characterFilter === null}
                className="filter-chip"
                data-active={characterFilter === null ? 'true' : 'false'}
                onClick={() => setCharacterFilter(null)}
                type="button"
              >
                Все
              </button>
              {characterCounts.map(([name, count]) => (
                <button
                  aria-pressed={characterFilter === name}
                  className="filter-chip"
                  data-active={characterFilter === name ? 'true' : 'false'}
                  key={name}
                  onClick={() => setCharacterFilter((current) => (current === name ? null : name))}
                  type="button"
                >
                  {name} <span className="dim">{count}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="page__body">
          {body}
          {createMutation.isError ? (
            <div className="empty" style={{ marginTop: 16 }}>
              <p>Не удалось создать чат. Проверьте rewrite API и попробуйте ещё раз.</p>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function ChatListSkeleton() {
  return (
    <div
      style={{
        display: 'grid',
        gap: 1,
        background: 'var(--hairline)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '40px minmax(0, 1.2fr) minmax(0, 2fr) 100px 80px',
            gap: 14,
            alignItems: 'center',
            padding: '12px 14px',
            background: 'var(--bg)',
          }}
        >
          <div className="avatar avatar--36" style={{ opacity: 0.4 }} />
          <div className="col" style={{ gap: 6 }}>
            <div style={{ height: 10, width: '40%', background: 'var(--surface-2)', borderRadius: 4 }} />
            <div style={{ height: 8, width: '70%', background: 'var(--surface-2)', borderRadius: 4 }} />
          </div>
          <div style={{ height: 10, width: '90%', background: 'var(--surface-2)', borderRadius: 4 }} />
          <div style={{ height: 10, width: 50, background: 'var(--surface-2)', borderRadius: 4, marginLeft: 'auto' }} />
          <div />
        </div>
      ))}
    </div>
  );
}
