import type { RuntimeLaunchConfig, RuntimeOverviewResponse } from '@immersion/contracts/runtime';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useMemo } from 'react';

import { getApiErrorMessage } from '../../../shared/api/get-api-error-message';
import { useServerSeededForm } from '../../../shared/lib/use-server-seeded-form';
import { PlayIcon } from '../../../shared/ui/icons';
import { saveRuntimeConfig } from '../api/save-runtime-config';
import { startRuntime } from '../api/start-runtime';
import {
  type LaunchParamsFormState,
  launchParamsFormsEqual,
  parseLaunchParamsForm,
  toLaunchParamsForm,
} from '../forms/launch-params-form-state';
import { runtimeOverviewQueryKey } from '../queries/runtime-overview-query';
import { startRuntimeMutationKey } from '../queries/start-runtime-mutation-key';
import { type LaunchRestartState, toLaunchRestartState } from '../view-models/launch-restart-state';
import { sameLaunchConfig } from '../view-models/same-launch-config';

interface LaunchParamsCardProps {
  overview: RuntimeOverviewResponse;
}

interface LaunchFieldProps {
  children: ReactNode;
  hint: string;
  htmlFor: string;
  label: string;
}

function LaunchField({ children, hint, htmlFor, label }: LaunchFieldProps) {
  return (
    <div className="field">
      <label className="muted" htmlFor={htmlFor} style={{ fontSize: 'var(--fz-xs)' }}>
        {label}
      </label>
      {children}
      <span className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
        {hint}
      </span>
    </div>
  );
}

function describeRunningConfig(config: RuntimeLaunchConfig | null): string {
  if (!config) {
    return 'Модель запущена с неизвестными параметрами';
  }

  return `Модель работает с ctx ${config.contextSize.toLocaleString('ru-RU')}, GPU ${config.gpuLayers}`;
}

function toLaunchConfig(overview: RuntimeOverviewResponse): RuntimeLaunchConfig {
  const { contextSize, flashAttention, gpuLayers, threads } = overview.serverConfig;

  return { contextSize, flashAttention, gpuLayers, threads };
}

export function LaunchParamsCard({ overview }: LaunchParamsCardProps) {
  const queryClient = useQueryClient();
  const saved = useMemo(() => toLaunchConfig(overview), [overview]);
  const savedForm = useMemo(() => toLaunchParamsForm(saved), [saved]);
  const [form, setForm] = useServerSeededForm(savedForm, launchParamsFormsEqual);

  const setOverview = (next: RuntimeOverviewResponse) => {
    queryClient.setQueryData(runtimeOverviewQueryKey, next);
  };
  const saveMutation = useMutation({ mutationFn: saveRuntimeConfig, onSuccess: setOverview });
  const restartMutation = useMutation({
    mutationFn: startRuntime,
    mutationKey: startRuntimeMutationKey,
    onSuccess: setOverview,
  });
  const isStarting = useIsMutating({ mutationKey: startRuntimeMutationKey }) > 0;

  const parsed = parseLaunchParamsForm(form);
  const validationError = 'error' in parsed ? parsed.error : null;
  const isDirty = 'config' in parsed ? !sameLaunchConfig(parsed.config, saved) : true;
  const restartState: LaunchRestartState = toLaunchRestartState(overview);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!('config' in parsed) || !isDirty || saveMutation.isPending) return;
    saveMutation.mutate(parsed.config);
  };

  const updateField = (patch: Partial<LaunchParamsFormState>) => {
    saveMutation.reset();
    setForm((current) => ({ ...current, ...patch }));
  };

  const errorMessage =
    (saveMutation.error ? getApiErrorMessage(saveMutation.error, 'Не удалось сохранить параметры запуска.') : null) ??
    (restartMutation.error ? getApiErrorMessage(restartMutation.error, 'Не удалось перезапустить модель.') : null);

  return (
    <section aria-label="Параметры запуска" className="card" style={{ padding: 18, display: 'grid', gap: 12 }}>
      <div className="between">
        <h2 style={{ margin: 0, fontSize: 'var(--fz-md)', fontWeight: 600 }}>Параметры запуска</h2>
        <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
          Применяются при запуске модели
        </span>
      </div>
      <form className="col gap-12" onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <LaunchField
            hint="Окно llama-server (-c). Промпт чата не превысит его."
            htmlFor="launch-context-size"
            label="Контекст, токенов"
          >
            <input
              className="input mono"
              id="launch-context-size"
              inputMode="numeric"
              onChange={(event) => updateField({ contextSize: event.currentTarget.value })}
              value={form.contextSize}
            />
          </LaunchField>
          <LaunchField hint="Слоёв модели на видеокарте (-ngl)." htmlFor="launch-gpu-layers" label="GPU-слои">
            <input
              className="input mono"
              id="launch-gpu-layers"
              inputMode="numeric"
              onChange={(event) => updateField({ gpuLayers: event.currentTarget.value })}
              value={form.gpuLayers}
            />
          </LaunchField>
          <LaunchField hint="0 — выбрать автоматически." htmlFor="launch-threads" label="Потоки CPU">
            <input
              className="input mono"
              id="launch-threads"
              inputMode="numeric"
              onChange={(event) => updateField({ threads: event.currentTarget.value })}
              value={form.threads}
            />
          </LaunchField>
        </div>
        <label className="row gap-8" style={{ alignItems: 'center', fontSize: 'var(--fz-sm)' }}>
          <input
            checked={form.flashAttention}
            onChange={(event) => updateField({ flashAttention: event.currentTarget.checked })}
            type="checkbox"
          />
          Flash attention
        </label>
        {validationError ? (
          <span style={{ color: 'var(--danger)', fontSize: 'var(--fz-xs)' }}>{validationError}</span>
        ) : null}
        <div className="row gap-8" style={{ alignItems: 'center' }}>
          <button
            className="btn btn--ghost-bordered"
            disabled={!isDirty || validationError !== null || saveMutation.isPending}
            type="submit"
          >
            {saveMutation.isPending ? 'Сохраняем…' : 'Сохранить'}
          </button>
          {isDirty && validationError === null ? (
            <button className="btn btn--xs" onClick={() => updateField(savedForm)} type="button">
              Отменить
            </button>
          ) : null}
        </div>
      </form>
      {restartState.kind === 'none' ? null : (
        <div className="card row gap-8" style={{ alignItems: 'center', borderColor: 'var(--warn)', padding: 10 }}>
          <span style={{ flex: 1, fontSize: 'var(--fz-xs)' }}>
            {describeRunningConfig(restartState.runningConfig)}.{' '}
            {restartState.kind === 'restart'
              ? 'Перезапустите её, чтобы применить сохранённые параметры.'
              : 'Остановите её и запустите заново, чтобы применить сохранённые параметры.'}
          </span>
          {restartState.kind === 'restart' ? (
            <button
              className="btn btn--xs btn--ghost-bordered"
              disabled={isStarting}
              onClick={() => restartMutation.mutate(restartState.command)}
              type="button"
            >
              <PlayIcon size={11} /> {restartMutation.isPending ? 'Перезапускаем…' : 'Перезапустить'}
            </button>
          ) : null}
        </div>
      )}
      {errorMessage ? (
        <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', padding: 10 }}>
          {errorMessage}
        </div>
      ) : null}
    </section>
  );
}
