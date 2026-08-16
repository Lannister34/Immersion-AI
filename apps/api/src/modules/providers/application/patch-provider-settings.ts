import {
  type PatchProviderSettingsCommand,
  PatchProviderSettingsCommandSchema,
  type ProviderConfig,
  UpdateProviderSettingsCommandSchema,
} from '@immersion/contracts/providers';

import { createDefaultProviderConfig, toProviderSettingsSnapshot } from '../domain/provider-settings.js';
import { ProviderSettingsRepository } from './provider-settings-repository.js';

function mergeConfig(current: ProviderConfig, patch: PatchProviderSettingsCommand['config']): ProviderConfig {
  const next: ProviderConfig = { ...current };

  if (patch?.url) {
    next.url = patch.url;
  }

  if (patch?.model) {
    next.model = patch.model;
  }

  if (patch?.apiKey !== undefined) {
    // Пустая строка — намеренное «убрать ключ», а не «оставь как было».
    if (patch.apiKey.trim().length > 0) {
      next.apiKey = patch.apiKey.trim();
    } else {
      delete next.apiKey;
    }
  }

  return next;
}

/**
 * Меняет только присланные поля. Конфиг правится у того провайдера, который
 * станет активным после запроса, — так «переключись на Anthropic и поставь
 * модель X» остаётся одним вызовом, а настройки остальных провайдеров не
 * трогаются.
 */
export async function patchProviderSettings(input: unknown, repository = new ProviderSettingsRepository()) {
  const command = PatchProviderSettingsCommandSchema.parse(input);
  const current = await repository.read();
  const activeProvider = command.activeProvider ?? current.activeProvider;
  const currentConfig = current.providerConfigs[activeProvider] ?? createDefaultProviderConfig(activeProvider);

  const next = UpdateProviderSettingsCommandSchema.parse({
    activeProvider,
    mode: command.mode ?? current.mode,
    providerConfigs: {
      ...current.providerConfigs,
      [activeProvider]: mergeConfig(currentConfig, command.config),
    },
  });

  await repository.write(next);

  return toProviderSettingsSnapshot(await repository.read());
}
