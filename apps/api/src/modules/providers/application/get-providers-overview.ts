import { type ProvidersOverviewResponse, ProvidersOverviewResponseSchema } from '@immersion/contracts/providers';

import { providerDefinitions } from '../domain/provider-catalog.js';
import type { GetProviderSettingsDependencies } from './get-provider-settings.js';

export async function getProvidersOverview(
  dependencies: GetProviderSettingsDependencies,
): Promise<ProvidersOverviewResponse> {
  const settings = dependencies.providerSettings.read();

  return ProvidersOverviewResponseSchema.parse({
    backendMode: settings.mode,
    activeProvider: settings.activeProvider,
    availableProviders: providerDefinitions,
    providerConfigs: providerDefinitions.map((definition) => {
      const config = (settings.providerConfigs[definition.type] ?? {}) as Record<string, string | undefined>;

      return {
        provider: definition.type,
        fields: definition.fields.map((field) => {
          const rawValue = config[field.key];
          const value = typeof rawValue === 'string' && rawValue.length > 0 ? rawValue : null;

          return {
            key: field.key,
            type: field.type,
            hasValue: value !== null,
            value: field.type === 'password' ? null : value,
          };
        }),
      };
    }),
  });
}
