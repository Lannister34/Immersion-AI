import type {
  ProviderMode,
  ProviderSettingsSnapshot,
  UpdateProviderSettingsCommand,
} from '@immersion/contracts/providers';
import type { RuntimeOverviewResponse, RuntimeStartCommand } from '@immersion/contracts/runtime';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { Topbar } from '../../app/layout/topbar';
import { getApiErrorMessage } from '../../shared/api/get-api-error-message';
import { pluralRu } from '../../shared/lib/plural';
import { ErrorBanner } from '../../shared/ui/error-banner';
import { CpuIcon, PlayIcon, PowerIcon, SearchIcon, SlidersIcon } from '../../shared/ui/icons';
import { describeVisionSupport, generationReadinessQueryOptions } from '../generation';
import { saveProviderSettings } from './api/save-provider-settings';
import { startRuntime } from './api/start-runtime';
import { stopRuntime } from './api/stop-runtime';
import { ExternalProviderForm } from './components/external-provider-form';
import { ModelDirsCard } from './model-dirs-card';
import { providerSettingsQueryKey, providerSettingsQueryOptions } from './queries/provider-settings-query';
import { runtimeOverviewQueryKey, runtimeOverviewQueryOptions } from './queries/runtime-overview-query';
import { ServerLogsCard } from './server-logs-card';
import { toModelRowState } from './view-models/model-row-state';
import { canStopRuntime } from './view-models/runtime-stop-availability';

function toProviderCommand(snapshot: ProviderSettingsSnapshot, mode: ProviderMode): UpdateProviderSettingsCommand {
  return {
    mode,
    activeProvider: snapshot.activeProvider,
    providerConfigs: snapshot.providerConfigs,
  };
}

function formatModelsDirsLabel(modelsDirs: string[]): string {
  const [firstDir] = modelsDirs;
  if (firstDir === undefined) return 'каталоги не заданы';
  if (modelsDirs.length === 1) return firstDir;
  return pluralRu(modelsDirs.length, ['каталог', 'каталога', 'каталогов']);
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

const ACTIVE_MODEL_STATUS_LABELS: Record<RuntimeOverviewResponse['serverStatus']['status'], string> = {
  idle: 'остановлена',
  starting: 'запускается',
  running: 'активна',
  stopping: 'останавливается',
  error: 'ошибка',
};

export function ServerControlScreen() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [paramsOpen, setParamsOpen] = useState(false);
  const providerSettingsQuery = useQuery(providerSettingsQueryOptions());
  const runtimeOverviewQuery = useQuery({
    ...runtimeOverviewQueryOptions(),
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
      queryClient.setQueryData(runtimeOverviewQueryKey, overview);
    },
  });

  const stopRuntimeMutation = useMutation({
    mutationFn: stopRuntime,
    onSuccess: (overview: RuntimeOverviewResponse) => {
      queryClient.setQueryData(runtimeOverviewQueryKey, overview);
    },
  });

  const [modeChangeError, setModeChangeError] = useState<string | null>(null);

  const snapshot = providerSettingsQuery.data;
  const generationReadinessQuery = useQuery(generationReadinessQueryOptions());
  const overview = runtimeOverviewQuery.data;
  const status = overview?.serverStatus.status ?? 'idle';
  const activeMode: ProviderMode = snapshot?.mode ?? 'builtin';

  const handleModeChange = async (mode: ProviderMode) => {
    if (!snapshot || mode === activeMode || saveProviderMutation.isPending) return;
    setModeChangeError(null);
    try {
      await saveProviderMutation.mutateAsync(toProviderCommand(snapshot, mode));
    } catch (error) {
      setModeChangeError(getApiErrorMessage(error, 'Не удалось переключить режим провайдера.'));
    }
  };

  const handleRuntimeStart = (command: RuntimeStartCommand) => {
    startRuntimeMutation.mutate(command);
  };

  const handleRuntimeStop = () => {
    stopRuntimeMutation.mutate();
  };

  let runtimeActionErrorMessage: string | null = null;
  if (startRuntimeMutation.error) {
    runtimeActionErrorMessage = getApiErrorMessage(startRuntimeMutation.error, 'Не удалось запустить модель.');
  } else if (stopRuntimeMutation.error) {
    runtimeActionErrorMessage = getApiErrorMessage(stopRuntimeMutation.error, 'Не удалось остановить сервер.');
  }

  const filteredModels = (overview?.models ?? []).filter((model) => {
    if (!search.trim()) return true;
    return model.name.toLowerCase().includes(search.trim().toLowerCase());
  });
  const activeModelName = overview?.serverStatus.model ?? null;
  const vision = describeVisionSupport(generationReadinessQuery.data?.visionSupport);

  let runtimeSubtitle = 'Загружаем настройки…';
  if (snapshot) {
    runtimeSubtitle =
      activeMode === 'builtin' ? `Локальный KoboldCpp · ${RUNTIME_STATUS_LABELS[status]}` : 'Внешний API провайдер';
  }

  let runtimeFallback: ReactNode;
  if (activeMode === 'builtin') {
    runtimeFallback = (
      <div className="empty" style={{ padding: 60 }}>
        <h2>{runtimeOverviewQuery.isError ? 'Не удалось загрузить runtime' : 'Загрузка runtime'}</h2>
        <p>
          {runtimeOverviewQuery.isError
            ? 'Проверьте rewrite API и состояние встроенного сервера.'
            : 'Получаем список моделей и состояние сервера.'}
        </p>
      </div>
    );
  } else {
    runtimeFallback = (
      <ExternalProviderForm
        isSaving={saveProviderMutation.isPending}
        onSave={(command) => saveProviderMutation.mutateAsync(command)}
        snapshot={snapshot}
      />
    );
  }

  return (
    <main className="main">
      <Topbar crumbs={[{ label: 'API / Сервер', strong: true }]} />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">LLM-runtime</h1>
              <div className="page__sub">{runtimeSubtitle}</div>
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
          {modeChangeError ? <ErrorBanner>{modeChangeError}</ErrorBanner> : null}
        </div>
        <div className="page__body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {runtimeActionErrorMessage ? <ErrorBanner>{runtimeActionErrorMessage}</ErrorBanner> : null}
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
                    {status === 'running' ? (
                      <span className={vision.tone === 'ok' ? 'pill pill--ok' : 'pill'} title={vision.hint}>
                        {vision.label}
                      </span>
                    ) : null}
                  </div>
                  {status === 'error' && overview.serverStatus.error ? (
                    <div className="row">
                      <span className="pill pill--danger">{overview.serverStatus.error}</span>
                    </div>
                  ) : null}
                  <div className="row gap-16 muted mono" style={{ fontSize: 'var(--fz-xs)' }}>
                    <span>port {overview.serverConfig.port}</span>
                    {overview.serverStatus.pid ? <span>pid {overview.serverStatus.pid}</span> : null}
                    <span>ctx {overview.serverConfig.contextSize.toLocaleString('ru-RU')}</span>
                    <span>GPU {overview.serverConfig.gpuLayers}</span>
                  </div>
                </div>
                <div className="row gap-8">
                  <button
                    className="btn btn--ghost-bordered"
                    onClick={() => setParamsOpen((current) => !current)}
                    style={paramsOpen ? { background: 'var(--surface-2)' } : undefined}
                    type="button"
                  >
                    <SlidersIcon size={13} /> Параметры
                  </button>
                  {canStopRuntime(status) ? (
                    <button
                      className="btn btn--danger"
                      disabled={stopRuntimeMutation.isPending}
                      onClick={handleRuntimeStop}
                      type="button"
                    >
                      <PowerIcon size={13} /> Остановить
                    </button>
                  ) : null}
                </div>
              </section>

              {paramsOpen ? (
                <ModelDirsCard dirsStatus={overview.modelsDirsStatus} serverConfig={overview.serverConfig} />
              ) : null}

              <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="between" style={{ padding: '12px 14px', borderBottom: '1px solid var(--hairline)' }}>
                  <div className="row gap-8">
                    <h2 style={{ margin: 0, fontSize: 'var(--fz-md)', fontWeight: 600 }}>Модели</h2>
                    <span
                      className="muted mono"
                      style={{ fontSize: 'var(--fz-xs)' }}
                      title={
                        overview.serverConfig.modelsDirs.length > 1
                          ? overview.serverConfig.modelsDirs.join('\n')
                          : undefined
                      }
                    >
                      {filteredModels.length} найдено · {formatModelsDirsLabel(overview.serverConfig.modelsDirs)}
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
                        const { canStart, isActive } = toModelRowState(model, overview.serverStatus);
                        return (
                          <tr key={model.path} style={isActive ? { background: 'var(--accent-soft)' } : undefined}>
                            <td>
                              <div className="row gap-8">
                                <CpuIcon size={14} stroke={isActive ? 'var(--accent)' : 'var(--muted)'} />
                                <div>
                                  <div className="row gap-6">
                                    <strong style={{ fontWeight: isActive ? 600 : 500 }}>{model.name}</strong>
                                    {model.visionProjectorPath ? (
                                      <span
                                        className="pill pill--ok"
                                        style={{ fontSize: 'var(--fz-2xs)' }}
                                        title="Рядом найден mmproj — модель запустится с поддержкой изображений."
                                      >
                                        Изображения
                                      </span>
                                    ) : null}
                                  </div>
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
                                <span className={RUNTIME_STATUS_PILL[status]}>
                                  <span className={RUNTIME_STATUS_DOT[status]} /> {ACTIVE_MODEL_STATUS_LABELS[status]}
                                </span>
                              ) : (
                                <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
                                  —
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {canStart ? (
                                <button
                                  className="btn btn--xs btn--ghost-bordered"
                                  disabled={startRuntimeMutation.isPending}
                                  onClick={() =>
                                    handleRuntimeStart({
                                      contextSize: overview.serverConfig.contextSize,
                                      flashAttention: overview.serverConfig.flashAttention,
                                      gpuLayers: overview.serverConfig.gpuLayers,
                                      modelPath: model.path,
                                      port: overview.serverConfig.port,
                                      threads: overview.serverConfig.threads,
                                      ...(model.visionProjectorPath ? { mmprojPath: model.visionProjectorPath } : {}),
                                    })
                                  }
                                  type="button"
                                >
                                  <PlayIcon size={11} /> Запустить
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </section>

              <ServerLogsCard status={status} />
            </>
          ) : (
            runtimeFallback
          )}
        </div>
      </div>
    </main>
  );
}
