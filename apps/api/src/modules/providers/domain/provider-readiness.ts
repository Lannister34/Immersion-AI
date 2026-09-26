import type { GenerationReadinessIssue } from '@immersion/contracts/generation';
import type { ProviderConfig, ProviderType } from '@immersion/contracts/providers';

import { getProviderDefaultModel, isProviderApiKeyRequired } from './provider-catalog.js';

export function resolveProviderModel(provider: ProviderType, config: ProviderConfig | undefined): string | null {
  return config?.model?.trim() || getProviderDefaultModel(provider);
}

export function findCloudProviderReadinessIssue(
  provider: ProviderType,
  config: ProviderConfig | undefined,
): GenerationReadinessIssue | null {
  if (isProviderApiKeyRequired(provider) && !config?.apiKey?.trim()) {
    return {
      code: 'external_provider_api_key_missing',
      message: 'API-ключ провайдера не задан. Укажите его на странице API.',
    };
  }

  if (!resolveProviderModel(provider, config)) {
    return {
      code: 'external_provider_model_missing',
      message: 'Модель провайдера не выбрана. Выберите её на странице API.',
    };
  }

  return null;
}
