import {
  type GenerationReadinessIssue,
  type GenerationReadinessResponse,
  GenerationReadinessResponseSchema,
} from '@immersion/contracts/generation';
import type { ProviderSettingsSnapshot } from '@immersion/contracts/providers';
import type { RuntimeOverviewResponse } from '@immersion/contracts/runtime';
import {
  normalizeGenerationProviderBaseUrl,
  resolveGenerationProviderEndpoint,
} from '../../providers/application/generation-provider.js';
import { getProviderSettings } from '../../providers/application/get-provider-settings.js';
import { getProviderDefaultModel, isProviderApiKeyRequired } from '../../providers/domain/provider-catalog.js';
import { getProviderVisionProbe } from '../../providers/infrastructure/provider-vision-probe.js';
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
    visionSupport: 'unknown',
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
    // Пока генерация заблокирована, спрашивать модель о картинках не у кого.
    visionSupport: 'unknown',
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
      visionSupport: 'unknown',
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
  const config = settings.providerConfigs[settings.activeProvider];
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

  if (isProviderApiKeyRequired(settings.activeProvider) && !config?.apiKey?.trim()) {
    return blocked(
      settings,
      {
        code: 'external_provider_api_key_missing',
        message: 'API-ключ провайдера не задан. Укажите его на странице API.',
      },
      null,
    );
  }

  if (!config?.model?.trim() && !getProviderDefaultModel(settings.activeProvider)) {
    return blocked(
      settings,
      {
        code: 'external_provider_model_missing',
        message: 'Модель провайдера не выбрана. Выберите её на странице API.',
      },
      null,
    );
  }

  return ready(settings);
}

/**
 * Поддержку изображений спрашиваем у самого сервера и только когда генерация
 * уже готова: у остановленного рантайма спрашивать нечего, а ответ кэшируется
 * в пробе — на частые опросы готовности это не ложится.
 */
async function withVisionSupport(readiness: GenerationReadinessResponse): Promise<GenerationReadinessResponse> {
  if (readiness.status !== 'ready') {
    return readiness;
  }

  try {
    const endpoint = await resolveGenerationProviderEndpoint();
    const visionSupport = await getProviderVisionProbe().getVisionSupport({
      baseUrl: endpoint.baseUrl,
      model: endpoint.model,
      // У встроенного сервера провайдера нет: там спрашиваем сам движок.
      provider: readiness.mode === 'builtin' ? null : readiness.activeProvider,
    });

    return { ...readiness, visionSupport };
  } catch {
    return readiness;
  }
}

export async function getGenerationReadiness(): Promise<GenerationReadinessResponse> {
  const settings = await getProviderSettings();
  const readiness = settings.mode === 'builtin' ? await getBuiltinReadiness(settings) : getExternalReadiness(settings);

  return withVisionSupport(readiness);
}
