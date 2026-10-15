import type { ProviderConfig, ProviderDefinition } from '@immersion/contracts/providers';

export interface ProviderFormState {
  url: string;
  apiKey: string;
  model: string;
}

function getFieldDefault(definition: ProviderDefinition | undefined, key: string): string {
  return definition?.fields.find((field) => field.key === key)?.defaultValue ?? '';
}

export function configToFormState(
  config: ProviderConfig | undefined,
  definition: ProviderDefinition | undefined,
): ProviderFormState {
  return {
    url: config?.url ?? getFieldDefault(definition, 'url'),
    apiKey: config?.apiKey ?? '',
    model: config?.model ?? getFieldDefault(definition, 'model'),
  };
}

export function formsEqual(left: ProviderFormState, right: ProviderFormState): boolean {
  return left.url === right.url && left.apiKey === right.apiKey && left.model === right.model;
}

export function buildProviderConfig(form: ProviderFormState): ProviderConfig {
  const config: ProviderConfig = { url: form.url.trim() };
  const trimmedApiKey = form.apiKey.trim();
  if (trimmedApiKey.length > 0) config.apiKey = trimmedApiKey;
  const trimmedModel = form.model.trim();
  if (trimmedModel.length > 0) config.model = trimmedModel;
  return config;
}
