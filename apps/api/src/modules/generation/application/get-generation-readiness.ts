import {
  type GenerationReadinessIssue,
  type GenerationReadinessResponse,
  GenerationReadinessResponseSchema,
} from '@immersion/contracts/generation';
import type { ProviderSettingsSnapshot } from '@immersion/contracts/providers';
import type { RuntimeOverviewResponse } from '@immersion/contracts/runtime';
import { normalizeGenerationProviderBaseUrl } from '../../providers/application/generation-provider.js';
import { getProviderSettings } from '../../providers/application/get-provider-settings.js';
import { getRuntimeOverview } from '../../runtime/application/get-runtime-overview.js';

function toRuntimeSummary(runtime: RuntimeOverviewResponse) {
  return {
    model: runtime.serverStatus.model,
    port: runtime.serverStatus.port,
    status: runtime.serverStatus.status,
  };
}

function ready(settings: ProviderSettingsSnapshot): GenerationReadinessResponse {
  return GenerationReadinessResponseSchema.parse({
    activeProvider: settings.activeProvider,
    issue: null,
    mode: settings.mode,
    runtime: null,
    status: 'ready',
  });
}

function blocked(
  settings: ProviderSettingsSnapshot,
  issue: GenerationReadinessIssue,
  runtime: RuntimeOverviewResponse | null,
): GenerationReadinessResponse {
  return GenerationReadinessResponseSchema.parse({
    activeProvider: settings.activeProvider,
    issue,
    mode: settings.mode,
    runtime: runtime ? toRuntimeSummary(runtime) : null,
    status: 'blocked',
  });
}

function getConfiguredExternalUrl(settings: ProviderSettingsSnapshot) {
  const config = settings.providerConfigs[settings.activeProvider];
  const url = config?.url;

  return typeof url === 'string' ? url.trim() : '';
}

async function getBuiltinReadiness(settings: ProviderSettingsSnapshot): Promise<GenerationReadinessResponse> {
  const runtime = await getRuntimeOverview();

  if (runtime.serverStatus.status === 'running') {
    return GenerationReadinessResponseSchema.parse({
      activeProvider: settings.activeProvider,
      issue: null,
      mode: settings.mode,
      runtime: toRuntimeSummary(runtime),
      status: 'ready',
    });
  }

  if (runtime.serverStatus.status === 'starting') {
    return blocked(
      settings,
      {
        code: 'builtin_runtime_starting',
        message: 'Встроенный сервер запускает модель. Дождитесь завершения загрузки.',
      },
      runtime,
    );
  }

  if (runtime.serverStatus.status === 'stopping') {
    return blocked(
      settings,
      {
        code: 'builtin_runtime_stopping',
        message: 'Встроенный сервер останавливается. Дождитесь завершения операции.',
      },
      runtime,
    );
  }

  if (runtime.serverStatus.status === 'error') {
    return blocked(
      settings,
      {
        code: 'builtin_runtime_error',
        message: runtime.serverStatus.error ?? 'Встроенный сервер завершился с ошибкой.',
      },
      runtime,
    );
  }

  if (!runtime.engine.found) {
    return blocked(
      settings,
      {
        code: 'builtin_runtime_not_installed',
        message: 'llama-server не установлен. Установите runtime на странице API.',
      },
      runtime,
    );
  }

  if (runtime.models.length === 0) {
    return blocked(
      settings,
      {
        code: 'builtin_no_models',
        message: 'Модели .gguf не найдены. Добавьте модель или папку с моделями на странице API.',
      },
      runtime,
    );
  }

  return blocked(
    settings,
    {
      code: 'builtin_runtime_not_running',
      message: 'Встроенный сервер не запущен. Запустите модель на странице API.',
    },
    runtime,
  );
}

function getExternalReadiness(settings: ProviderSettingsSnapshot): GenerationReadinessResponse {
  const providerUrl = getConfiguredExternalUrl(settings);

  if (!providerUrl) {
    return blocked(
      settings,
      {
        code: 'external_provider_url_missing',
        message: 'URL внешнего API не настроен. Укажите endpoint на странице API.',
      },
      null,
    );
  }

  try {
    normalizeGenerationProviderBaseUrl(providerUrl);
  } catch {
    return blocked(
      settings,
      {
        code: 'external_provider_url_invalid',
        message: 'URL внешнего API должен быть абсолютным HTTP(S)-адресом.',
      },
      null,
    );
  }

  return ready(settings);
}

export async function getGenerationReadiness(): Promise<GenerationReadinessResponse> {
  const settings = await getProviderSettings();

  return settings.mode === 'builtin' ? await getBuiltinReadiness(settings) : getExternalReadiness(settings);
}
