import type {
  RuntimeConfigSnapshot,
  RuntimeModelsDirStatus,
  RuntimeOverviewResponse,
} from '@immersion/contracts/runtime';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';

import { getApiErrorMessage } from '../../shared/api/get-api-error-message';
import { FolderIcon, PlusIcon, XIcon } from '../../shared/ui/icons';
import { saveRuntimeConfig } from './api/save-runtime-config';
import { runtimeOverviewQueryKey } from './queries/runtime-overview-query';

interface ModelDirsCardProps {
  dirsStatus: RuntimeModelsDirStatus[];
  serverConfig: RuntimeConfigSnapshot;
}

function dirsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((dir, index) => dir === right[index]);
}

export function ModelDirsCard({ dirsStatus, serverConfig }: ModelDirsCardProps) {
  const queryClient = useQueryClient();
  // Структурный шаринг TanStack Query держит ссылку стабильной между
  // опросами overview, поэтому черновик не сбрасывается без реальных изменений.
  const baseline = serverConfig.modelsDirs;
  const [draftDirs, setDraftDirs] = useState<string[]>(baseline);
  const [newDir, setNewDir] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setDraftDirs(baseline);
    setValidationError(null);
  }, [baseline]);

  const saveMutation = useMutation({
    mutationFn: saveRuntimeConfig,
    onSuccess: async (overview: RuntimeOverviewResponse) => {
      queryClient.setQueryData(runtimeOverviewQueryKey, overview);
      // Инвалидация — чтобы таблица моделей перечитала свежий скан каталогов.
      await queryClient.invalidateQueries({ queryKey: runtimeOverviewQueryKey });
    },
  });

  const existsByPath = new Map(dirsStatus.map((entry) => [entry.path, entry.exists]));
  const isDirty = !dirsEqual(draftDirs, baseline);

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = newDir.trim();
    if (trimmed.length === 0) {
      setValidationError('Укажите абсолютный путь к каталогу.');
      return;
    }
    if (draftDirs.includes(trimmed)) {
      setValidationError('Такой каталог уже есть в списке.');
      return;
    }
    setDraftDirs((current) => [...current, trimmed]);
    setNewDir('');
    setValidationError(null);
  };

  const handleRemove = (dir: string) => {
    setDraftDirs((current) => current.filter((entry) => entry !== dir));
    setValidationError(null);
  };

  const handleSave = () => {
    saveMutation.mutate({ ...serverConfig, modelsDirs: draftDirs });
  };

  const handleReset = () => {
    setDraftDirs(baseline);
    setNewDir('');
    setValidationError(null);
  };

  const errorMessage =
    validationError ??
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
        {draftDirs.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 'var(--fz-xs)' }}>
            Каталоги не заданы — список моделей будет пуст.
          </p>
        ) : (
          <ul className="col gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {draftDirs.map((dir) => (
              <li className="row gap-8" key={dir} style={{ alignItems: 'center' }}>
                <FolderIcon size={13} />
                <span className="mono" style={{ fontSize: 'var(--fz-xs)', wordBreak: 'break-all' }}>
                  {dir}
                </span>
                {existsByPath.get(dir) === false ? <span className="pill pill--warn">не найден</span> : null}
                <button
                  className="btn btn--xs btn--ghost-bordered"
                  onClick={() => handleRemove(dir)}
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
          <button className="btn btn--ghost-bordered" type="submit">
            <PlusIcon size={13} /> Добавить
          </button>
        </form>
        {errorMessage ? (
          <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', padding: 10 }}>
            {errorMessage}
          </div>
        ) : null}
        <div className="between" style={{ alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
            Отсутствующие каталоги игнорируются при сканировании.
          </span>
          <div className="row gap-8">
            <button className="btn" disabled={!isDirty || saveMutation.isPending} onClick={handleReset} type="button">
              Отменить
            </button>
            <button
              className="btn btn--primary"
              disabled={!isDirty || saveMutation.isPending}
              onClick={handleSave}
              type="button"
            >
              {saveMutation.isPending ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
