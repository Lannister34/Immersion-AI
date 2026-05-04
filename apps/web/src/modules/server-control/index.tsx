import type {
  ProviderMode,
  ProviderSettingsSnapshot,
  UpdateProviderSettingsCommand,
} from '@immersion/contracts/providers';
import type { RuntimeOverviewResponse, RuntimeStartCommand } from '@immersion/contracts/runtime';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Topbar } from '../../app/layout/topbar';
import {
  CpuIcon,
  FolderIcon,
  HistoryIcon,
  MoreIcon,
  PlayIcon,
  PowerIcon,
  RefreshIcon,
  SearchIcon,
} from '../../shared/ui/icons';
import { getRuntimeOverview } from './api/get-runtime-overview';
import { saveProviderSettings } from './api/save-provider-settings';
import { startRuntime } from './api/start-runtime';
import { stopRuntime } from './api/stop-runtime';
import { providerSettingsQueryKey, providerSettingsQueryOptions } from './queries/provider-settings-query';

function toProviderCommand(snapshot: ProviderSettingsSnapshot, mode: ProviderMode): UpdateProviderSettingsCommand {
  return {
    mode,
    activeProvider: snapshot.activeProvider,
    providerConfigs: snapshot.providerConfigs,
  };
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

const RUNTIME_STATUS_LABELS: Record<RuntimeOverviewResponse['serverStatus']['status'], string> = {
  idle: 'остановлен',
  starting: 'запускается',
  running: 'работает',
  stopping: 'останавливается',
  error: 'ошибка',
};

const RUNTIME_STATUS_DOT: Record<RuntimeOverviewResponse['serverStatus']['status'], string> = {
  idle: 'dot dot--idle',
  starting: 'dot dot--pulse',
  running: 'dot dot--running',
  stopping: 'dot dot--pulse',
  error: 'dot dot--danger',
};

const RUNTIME_STATUS_PILL: Record<RuntimeOverviewResponse['serverStatus']['status'], string> = {
  idle: 'pill',
  starting: 'pill pill--warn',
  running: 'pill pill--ok',
  stopping: 'pill pill--warn',
  error: 'pill pill--danger',
};

export function ServerControlScreen() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const providerSettingsQuery = useQuery(providerSettingsQueryOptions());
  const runtimeOverviewQuery = useQuery({
    queryKey: ['runtime', 'overview'],
    queryFn: getRuntimeOverview,
    refetchInterval: 2500,
  });

  const saveProviderMutation = useMutation({
    mutationFn: saveProviderSettings,
    onSuccess: async (snapshot) => {
      queryClient.setQueryData(providerSettingsQueryKey, snapshot);
      await queryClient.invalidateQueries({ queryKey: ['providers', 'overview'] });
    },
  });

  const startRuntimeMutation = useMutation({
    mutationFn: startRuntime,
    onSuccess: (overview: RuntimeOverviewResponse) => {
      queryClient.setQueryData(['runtime', 'overview'], overview);
    },
  });

  const stopRuntimeMutation = useMutation({
    mutationFn: stopRuntime,
    onSuccess: (overview: RuntimeOverviewResponse) => {
      queryClient.setQueryData(['runtime', 'overview'], overview);
    },
  });

  const snapshot = providerSettingsQuery.data;
  const overview = runtimeOverviewQuery.data;
  const status = overview?.serverStatus.status ?? 'idle';
  const activeMode: ProviderMode = snapshot?.mode ?? 'builtin';

  const handleModeChange = async (mode: ProviderMode) => {
    if (!snapshot || mode === activeMode || saveProviderMutation.isPending) return;
    await saveProviderMutation.mutateAsync(toProviderCommand(snapshot, mode));
  };

  const handleRuntimeStart = async (command: RuntimeStartCommand) => {
    await startRuntimeMutation.mutateAsync(command);
  };

  const handleRuntimeStop = async () => {
    await stopRuntimeMutation.mutateAsync();
  };

  const filteredModels = (overview?.models ?? []).filter((model) => {
    if (!search.trim()) return true;
    return model.name.toLowerCase().includes(search.trim().toLowerCase());
  });
  const activeModelName = overview?.serverStatus.model ?? null;

  return (
    <main className="main">
      <Topbar
        actions={
          <button className="btn" type="button">
            <HistoryIcon size={13} /> История запусков
          </button>
        }
        crumbs={[{ label: 'API / Сервер', strong: true }]}
        search={false}
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">LLM-runtime</h1>
              <div className="page__sub">
                {snapshot
                  ? activeMode === 'builtin'
                    ? `Локальный KoboldCpp · ${RUNTIME_STATUS_LABELS[status]}`
                    : 'Внешний API провайдер'
                  : 'Загружаем настройки…'}
              </div>
            </div>
            <div className="row gap-2 card" style={{ padding: 2 }}>
              <button
                className="btn btn--xs"
                disabled={!snapshot || saveProviderMutation.isPending}
                onClick={() => void handleModeChange('builtin')}
                style={{ background: activeMode === 'builtin' ? 'var(--surface-2)' : 'transparent' }}
                type="button"
              >
                Встроенный
              </button>
              <button
                className="btn btn--xs"
                disabled={!snapshot || saveProviderMutation.isPending}
                onClick={() => void handleModeChange('external')}
                style={{ background: activeMode === 'external' ? 'var(--surface-2)' : 'transparent' }}
                type="button"
              >
                Внешний API
              </button>
            </div>
          </div>
        </div>
        <div className="page__body" style={{ display: 'grid', gap: 14 }}>
          {activeMode === 'builtin' && overview ? (
            <>
              <section
                className="card"
                style={{
                  padding: 18,
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 18,
                  alignItems: 'center',
                }}
              >
                <span className={RUNTIME_STATUS_DOT[status]} style={{ width: 14, height: 14 }} />
                <div className="col gap-4">
                  <div className="row gap-12">
                    <strong style={{ fontSize: 'var(--fz-xl)' }}>{activeModelName ?? 'Модель не выбрана'}</strong>
                    <span className={RUNTIME_STATUS_PILL[status]}>{RUNTIME_STATUS_LABELS[status]}</span>
                  </div>
                  <div className="row gap-16 muted mono" style={{ fontSize: 'var(--fz-xs)' }}>
                    <span>port {overview.serverConfig.port}</span>
                    {overview.serverStatus.pid ? <span>pid {overview.serverStatus.pid}</span> : null}
                    <span>ctx {overview.serverConfig.contextSize.toLocaleString('ru-RU')}</span>
                    <span>GPU {overview.serverConfig.gpuLayers}</span>
                  </div>
                </div>
                <div className="row gap-8">
                  <button className="btn btn--ghost-bordered" type="button">
                    <RefreshIcon size={13} /> Параметры
                  </button>
                  {status === 'running' ? (
                    <button
                      className="btn btn--danger"
                      disabled={stopRuntimeMutation.isPending}
                      onClick={() => void handleRuntimeStop()}
                      type="button"
                    >
                      <PowerIcon size={13} /> Остановить
                    </button>
                  ) : null}
                </div>
              </section>

              <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="between" style={{ padding: '12px 14px', borderBottom: '1px solid var(--hairline)' }}>
                  <div className="row gap-8">
                    <h2 style={{ margin: 0, fontSize: 'var(--fz-md)', fontWeight: 600 }}>Модели</h2>
                    <span className="muted mono" style={{ fontSize: 'var(--fz-xs)' }}>
                      {filteredModels.length} найдено · {overview.serverConfig.modelsDirs[0] ?? '—'}
                    </span>
                  </div>
                  <div className="row gap-8">
                    <div className="search" style={{ minWidth: 200 }}>
                      <SearchIcon size={13} />
                      <input
                        onChange={(event) => setSearch(event.currentTarget.value)}
                        placeholder="Имя модели"
                        value={search}
                      />
                    </div>
                    <button className="btn" type="button">
                      <FolderIcon size={13} /> Каталоги
                    </button>
                  </div>
                </div>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Модель</th>
                      <th>Размер</th>
                      <th>Источник</th>
                      <th>Статус</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredModels.length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          <div className="empty" style={{ padding: 20 }}>
                            <p>Модели не найдены. Проверьте каталог моделей в настройках runtime.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredModels.map((model) => {
                        const isActive = model.name === activeModelName;
                        return (
                          <tr key={model.path} style={isActive ? { background: 'var(--accent-soft)' } : undefined}>
                            <td>
                              <div className="row gap-8">
                                <CpuIcon size={14} stroke={isActive ? 'var(--accent)' : 'var(--muted)'} />
                                <div>
                                  <strong style={{ fontWeight: isActive ? 600 : 500 }}>{model.name}</strong>
                                  <div className="muted mono" style={{ fontSize: 'var(--fz-2xs)' }}>
                                    {model.path}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="mono tnum">{formatBytes(model.size)}</td>
                            <td className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
                              {model.sourceDirectory}
                            </td>
                            <td>
                              {isActive ? (
                                <span className="pill pill--ok">
                                  <span className="dot dot--ok" /> активна
                                </span>
                              ) : (
                                <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
                                  —
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {isActive ? (
                                <button className="btn btn--icon btn--xs" type="button">
                                  <MoreIcon size={12} />
                                </button>
                              ) : (
                                <button
                                  className="btn btn--xs btn--ghost-bordered"
                                  disabled={startRuntimeMutation.isPending}
                                  onClick={() =>
                                    void handleRuntimeStart({
                                      contextSize: overview.serverConfig.contextSize,
                                      flashAttention: overview.serverConfig.flashAttention,
                                      gpuLayers: overview.serverConfig.gpuLayers,
                                      modelPath: model.path,
                                      port: overview.serverConfig.port,
                                      threads: overview.serverConfig.threads,
                                    })
                                  }
                                  type="button"
                                >
                                  <PlayIcon size={11} /> Запустить
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </section>
            </>
          ) : activeMode === 'builtin' ? (
            <div className="empty" style={{ padding: 60 }}>
              <h2>{runtimeOverviewQuery.isError ? 'Не удалось загрузить runtime' : 'Загрузка runtime'}</h2>
              <p>
                {runtimeOverviewQuery.isError
                  ? 'Проверьте rewrite API и состояние встроенного сервера.'
                  : 'Получаем список моделей и состояние сервера.'}
              </p>
            </div>
          ) : (
            <ExternalProviderForm snapshot={snapshot} />
          )}
        </div>
      </div>
    </main>
  );
}

function ExternalProviderForm({ snapshot }: { snapshot: ProviderSettingsSnapshot | undefined }) {
  if (!snapshot) {
    return (
      <div className="empty" style={{ padding: 60 }}>
        <p>Загрузка настроек провайдера…</p>
      </div>
    );
  }
  const config = snapshot.providerConfigs.custom ?? snapshot.providerConfigs.koboldcpp;
  return (
    <section className="card" style={{ padding: 18, display: 'grid', gap: 14 }}>
      <h2 style={{ margin: 0, fontSize: 'var(--fz-xl)', fontWeight: 600 }}>Внешний API</h2>
      <div className="field">
        <label>Base URL</label>
        <input className="input" defaultValue={config?.url ?? ''} readOnly />
      </div>
      <div className="field">
        <label>Модель</label>
        <input className="input" defaultValue={config?.model ?? ''} readOnly />
      </div>
      <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
        Редактирование внешних провайдеров будет добавлено в следующей итерации.
      </div>
    </section>
  );
}
