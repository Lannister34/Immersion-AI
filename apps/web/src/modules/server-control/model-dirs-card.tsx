import type {
  RuntimeConfigSnapshot,
  RuntimeModelsDirStatus,
  RuntimeOverviewResponse,
} from '@immersion/contracts/runtime';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';

import { getApiErrorMessage } from '../../shared/api/get-api-error-message';
import { FolderIcon, PlusIcon, SearchIcon, XIcon } from '../../shared/ui/icons';
import { pickRuntimeDirectory } from './api/pick-runtime-directory';
import { saveRuntimeConfig } from './api/save-runtime-config';
import { runtimeOverviewQueryKey } from './queries/runtime-overview-query';

interface ModelDirsCardProps {
  dirsStatus: RuntimeModelsDirStatus[];
  serverConfig: RuntimeConfigSnapshot;
}

export function ModelDirsCard({ dirsStatus, serverConfig }: ModelDirsCardProps) {
  const queryClient = useQueryClient();
  // Список показываем прямо из ответа сервера: черновика, который можно забыть
  // сохранить и потерять при фоновом опросе, здесь больше нет.
  const dirs = serverConfig.modelsDirs;
  const [newDir, setNewDir] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: saveRuntimeConfig,
    onSuccess: async (overview: RuntimeOverviewResponse) => {
      queryClient.setQueryData(runtimeOverviewQueryKey, overview);
      // Инвалидация — чтобы таблица моделей перечитала свежий скан каталогов.
      await queryClient.invalidateQueries({ queryKey: runtimeOverviewQueryKey });
    },
  });

  const existsByPath = new Map(dirsStatus.map((entry) => [entry.path, entry.exists]));

  const applyDirs = (nextDirs: string[]) => {
    setValidationError(null);
    saveMutation.mutate({ ...serverConfig, modelsDirs: nextDirs });
  };

  const addDir = (candidate: string) => {
    const trimmed = candidate.trim();

    if (trimmed.length === 0) {
      setValidationError('Укажите абсолютный путь к каталогу.');
      return;
    }

    if (dirs.includes(trimmed)) {
      setValidationError('Такой каталог уже есть в списке.');
      return;
    }

    applyDirs([...dirs, trimmed]);
    setNewDir('');
  };

  // Приложение локальное: диалог открывается на той же машине, где браузер.
  const pickMutation = useMutation({
    mutationFn: () => pickRuntimeDirectory({ initialPath: newDir.trim() }),
    onSuccess: (response) => {
      // Отмену диалога отличаем от выбора: null — пользователь закрыл окно.
      if (response.path) {
        addDir(response.path);
      }
    },
  });

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addDir(newDir);
  };

  const errorMessage =
    validationError ??
    (pickMutation.error ? getApiErrorMessage(pickMutation.error, 'Не удалось открыть системный диалог.') : null) ??
    (saveMutation.error ? getApiErrorMessage(saveMutation.error, 'Не удалось сохранить каталоги моделей.') : null);

  return (
    <section className="card" style={{ padding: 18, display: 'grid', gap: 12 }}>
      <div className="between">
        <h2 style={{ margin: 0, fontSize: 'var(--fz-md)', fontWeight: 600 }}>Параметры</h2>
        <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
          Каталоги сканируются на файлы .gguf
        </span>
      </div>
      <div className="col gap-8">
        <h3 style={{ margin: 0, fontSize: 'var(--fz-sm)', fontWeight: 600 }}>Каталоги моделей</h3>
        {dirs.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 'var(--fz-xs)' }}>
            Каталоги не заданы — список моделей будет пуст.
          </p>
        ) : (
          <ul className="col gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {dirs.map((dir) => (
              <li className="row gap-8" key={dir} style={{ alignItems: 'center' }}>
                <FolderIcon size={13} />
                <span className="mono" style={{ fontSize: 'var(--fz-xs)', wordBreak: 'break-all' }}>
                  {dir}
                </span>
                {existsByPath.get(dir) === false ? <span className="pill pill--warn">не найден</span> : null}
                <button
                  className="btn btn--xs btn--ghost-bordered"
                  disabled={saveMutation.isPending}
                  onClick={() => applyDirs(dirs.filter((entry) => entry !== dir))}
                  style={{ marginLeft: 'auto' }}
                  type="button"
                >
                  <XIcon size={11} /> Убрать
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="row gap-8" onSubmit={handleAdd}>
          <input
            aria-label="Новый каталог моделей"
            className="input"
            onChange={(event) => {
              // Значение читаем синхронно: в отложенном апдейтере event.currentTarget уже null.
              const { value } = event.currentTarget;
              setNewDir(value);
              setValidationError(null);
            }}
            placeholder="Абсолютный путь к каталогу с моделями"
            style={{ flex: 1 }}
            value={newDir}
          />
          <button
            className="btn btn--ghost-bordered"
            disabled={pickMutation.isPending}
            onClick={() => pickMutation.mutate()}
            title="Открыть системный диалог выбора папки"
            type="button"
          >
            <SearchIcon size={13} /> {pickMutation.isPending ? 'Ждём диалог…' : 'Выбрать'}
          </button>
          <button className="btn btn--ghost-bordered" disabled={saveMutation.isPending} type="submit">
            <PlusIcon size={13} /> Добавить
          </button>
        </form>
        {pickMutation.isPending ? (
          <span className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
            Окно выбора папки открыто поверх остальных окон — выберите каталог или закройте его.
          </span>
        ) : null}
        {errorMessage ? (
          <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', padding: 10 }}>
            {errorMessage}
          </div>
        ) : null}
        <span className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
          {saveMutation.isPending
            ? 'Сохраняем…'
            : 'Изменения применяются сразу. Отсутствующие каталоги игнорируются при сканировании.'}
        </span>
      </div>
    </section>
  );
}
