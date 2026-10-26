import {
  type GenerationReadinessIssue,
  type GenerationReadinessResponse,
  GenerationReadinessResponseSchema,
  type VisionSupport,
} from '@immersion/contracts/generation';
import type { ProviderSettingsSnapshot } from '@immersion/contracts/providers';
import type { RuntimeOverviewResponse } from '@immersion/contracts/runtime';

import { findCloudProviderReadinessIssue, normalizeGenerationProviderBaseUrl } from '../../providers/index.js';
import type {
  ProviderEndpointResolver,
  ProviderSettingsReader,
  RuntimeEndpointSource,
  VisionSupportProbe,
} from './generation-ports.js';

export interface GenerationReadinessDependencies {
  readonly providers: ProviderEndpointResolver & ProviderSettingsReader;
  readonly runtime: RuntimeEndpointSource;
  readonly visionProbe: VisionSupportProbe;
}

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
    visionSupport: 'unknown',
  });
}

function getConfiguredExternalUrl(settings: ProviderSettingsSnapshot) {
  const config = settings.providerConfigs[settings.activeProvider];
  const url = config?.url;

  return typeof url === 'string' ? url.trim() : '';
}

async function getBuiltinReadiness(
  settings: ProviderSettingsSnapshot,
  runtimeSource: Pick<RuntimeEndpointSource, 'getRuntimeOverview'>,
): Promise<GenerationReadinessResponse> {
  const runtime = await runtimeSource.getRuntimeOverview();

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

  const cloudProviderIssue = findCloudProviderReadinessIssue(settings.activeProvider, config);

  if (cloudProviderIssue) {
    return blocked(settings, cloudProviderIssue, null);
  }

  return ready(settings);
}

export function resolveBuiltinVisionSupport(visionProjectorPath: string | null): VisionSupport {
  return visionProjectorPath ? 'supported' : 'unsupported';
}

async function withVisionSupport(
  readiness: GenerationReadinessResponse,
  dependencies: GenerationReadinessDependencies,
): Promise<GenerationReadinessResponse> {
  if (readiness.status !== 'ready') {
    return readiness;
  }

  try {
    if (readiness.mode === 'builtin') {
      const runtimeEndpoint = await dependencies.runtime.getRunningRuntimeEndpoint();

      return {
        ...readiness,
        visionSupport: resolveBuiltinVisionSupport(runtimeEndpoint?.visionProjectorPath ?? null),
      };
    }

    const endpoint = await dependencies.providers.resolveGenerationProviderEndpoint();
    const visionSupport = await dependencies.visionProbe.getVisionSupport({
      baseUrl: endpoint.baseUrl,
      model: endpoint.model,
      provider: readiness.activeProvider,
    });

    return { ...readiness, visionSupport };
  } catch {
    return readiness;
  }
}

export async function getGenerationReadiness(
  dependencies: GenerationReadinessDependencies,
): Promise<GenerationReadinessResponse> {
  const settings = await dependencies.providers.getProviderSettings();
  const readiness =
    settings.mode === 'builtin'
      ? await getBuiltinReadiness(settings, dependencies.runtime)
      : getExternalReadiness(settings);

  return withVisionSupport(readiness, dependencies);
}
