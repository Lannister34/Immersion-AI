import type {
  ProviderConfig,
  ProviderMode,
  ProviderSettingsSnapshot,
  ProviderType,
  UpdateProviderSettingsCommand,
} from '@immersion/contracts/providers';
import type { RuntimeOverviewResponse, RuntimeStartCommand } from '@immersion/contracts/runtime';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { Topbar } from '../../app/layout/topbar';
import { getApiErrorMessage } from '../../shared/api/get-api-error-message';
import { CpuIcon, PlayIcon, PowerIcon, RefreshIcon, SearchIcon } from '../../shared/ui/icons';
import { saveProviderSettings } from './api/save-provider-settings';
import { startRuntime } from './api/start-runtime';
import { stopRuntime } from './api/stop-runtime';
import { providerSettingsQueryKey, providerSettingsQueryOptions } from './queries/provider-settings-query';
import { runtimeOverviewQueryKey, runtimeOverviewQueryOptions } from './queries/runtime-overview-query';

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

  return (
    <main className="main">
      <Topbar crumbs={[{ label: 'API / Сервер', strong: true }]} />
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
          {modeChangeError ? (
            <div
              className="card"
              style={{ borderColor: 'var(--danger)', color: 'var(--danger)', marginTop: 10, padding: 10 }}
            >
              {modeChangeError}
            </div>
          ) : null}
        </div>
        <div className="page__body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {runtimeActionErrorMessage ? (
            <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', padding: 10 }}>
              {runtimeActionErrorMessage}
            </div>
          ) : null}
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
                      onClick={handleRuntimeStop}
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
                              {isActive ? null : (
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
            <ExternalProviderForm
              isSaving={saveProviderMutation.isPending}
              onSave={(command) => saveProviderMutation.mutateAsync(command)}
              snapshot={snapshot}
            />
          )}
        </div>
      </div>
    </main>
  );
}

interface ProviderFormState {
  url: string;
  apiKey: string;
  model: string;
}

function configToFormState(config: ProviderConfig | undefined): ProviderFormState {
  return {
    url: config?.url ?? '',
    apiKey: config?.apiKey ?? '',
    model: config?.model ?? '',
  };
}

function formsEqual(left: ProviderFormState, right: ProviderFormState): boolean {
  return left.url === right.url && left.apiKey === right.apiKey && left.model === right.model;
}

function buildProviderConfig(form: ProviderFormState): ProviderConfig {
  const config: ProviderConfig = { url: form.url.trim() };
  const trimmedApiKey = form.apiKey.trim();
  if (trimmedApiKey.length > 0) config.apiKey = trimmedApiKey;
  const trimmedModel = form.model.trim();
  if (trimmedModel.length > 0) config.model = trimmedModel;
  return config;
}

interface ExternalProviderFormProps {
  isSaving: boolean;
  onSave: (command: UpdateProviderSettingsCommand) => Promise<unknown>;
  snapshot: ProviderSettingsSnapshot | undefined;
}

function ExternalProviderForm({ isSaving, onSave, snapshot }: ExternalProviderFormProps) {
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>(snapshot?.activeProvider ?? 'custom');
  const baseline = useMemo(
    () => configToFormState(snapshot?.providerConfigs[selectedProvider]),
    [selectedProvider, snapshot?.providerConfigs],
  );
  const [form, setForm] = useState<ProviderFormState>(baseline);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setForm(baseline);
    setSavedAt(null);
    setErrorMessage(null);
  }, [baseline]);

  if (!snapshot) {
    return (
      <div className="empty" style={{ padding: 60 }}>
        <p>Загрузка настроек провайдера…</p>
      </div>
    );
  }

  const isDirty = !formsEqual(form, baseline) || selectedProvider !== snapshot.activeProvider;
  const canSave = isDirty && form.url.trim().length > 0 && !isSaving;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    setErrorMessage(null);
    try {
      const nextConfigs = {
        ...snapshot.providerConfigs,
        [selectedProvider]: buildProviderConfig(form),
      };
      await onSave({
        mode: snapshot.mode,
        activeProvider: selectedProvider,
        providerConfigs: nextConfigs,
      });
      setSavedAt(Date.now());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось сохранить настройки внешнего API.');
    }
  };

  const definition = snapshot.providerDefinitions.find((entry) => entry.type === selectedProvider);
  const hasApiKeyField = definition?.fields.some((field) => field.key === 'apiKey') ?? false;
  const hasModelField = definition?.fields.some((field) => field.key === 'model') ?? false;

  return (
    <section className="card" style={{ padding: 18, display: 'grid', gap: 14 }}>
      <div className="between">
        <h2 style={{ margin: 0, fontSize: 'var(--fz-xl)', fontWeight: 600 }}>Внешний API</h2>
        <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
          {selectedProvider === snapshot.activeProvider ? 'активный провайдер' : 'переключим на этого при сохранении'}
        </span>
      </div>
      <form className="col gap-12" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="provider-type">Провайдер</label>
          <select
            className="input"
            id="provider-type"
            onChange={(event) => setSelectedProvider(event.currentTarget.value as ProviderType)}
            value={selectedProvider}
          >
            {snapshot.providerDefinitions.map((entry) => (
              <option key={entry.type} value={entry.type}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="provider-url">Base URL</label>
          <input
            className="input"
            id="provider-url"
            onChange={(event) => {
              // Значение читаем синхронно: в отложенном апдейтере event.currentTarget уже null.
              const { value } = event.currentTarget;
              setForm((current) => ({ ...current, url: value }));
            }}
            placeholder="http://127.0.0.1:5001"
            type="url"
            value={form.url}
          />
        </div>
        {hasApiKeyField ? (
          <div className="field">
            <label htmlFor="provider-api-key">API-ключ</label>
            <input
              autoComplete="off"
              className="input"
              id="provider-api-key"
              onChange={(event) => {
                const { value } = event.currentTarget;
                setForm((current) => ({ ...current, apiKey: value }));
              }}
              placeholder="опционально"
              type="password"
              value={form.apiKey}
            />
          </div>
        ) : null}
        {hasModelField ? (
          <div className="field">
            <label htmlFor="provider-model">Модель</label>
            <input
              className="input"
              id="provider-model"
              onChange={(event) => {
                const { value } = event.currentTarget;
                setForm((current) => ({ ...current, model: value }));
              }}
              placeholder="опционально, например: local-model"
              value={form.model}
            />
          </div>
        ) : null}
        {errorMessage ? (
          <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', padding: 10 }}>
            {errorMessage}
          </div>
        ) : null}
        <div className="row gap-8" style={{ justifyContent: 'flex-end', alignItems: 'center' }}>
          {savedAt && !isDirty ? (
            <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
              Настройки внешнего API сохранены.
            </span>
          ) : null}
          <button
            className="btn"
            disabled={!isDirty || isSaving}
            onClick={() => {
              setForm(baseline);
              setSelectedProvider(snapshot.activeProvider);
            }}
            type="button"
          >
            Отменить
          </button>
          <button className="btn btn--primary" disabled={!canSave} type="submit">
            {isSaving ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </section>
  );
}
