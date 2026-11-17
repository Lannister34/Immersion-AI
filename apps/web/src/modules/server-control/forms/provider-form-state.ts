import type {
  PatchProviderSettingsCommand,
  ProviderConfigView,
  ProviderDefinition,
  ProviderType,
} from '@immersion/contracts/providers';

export interface ProviderFormState {
  url: string;
  model: string;
  newApiKey: string;
  clearApiKey: boolean;
}

function getFieldDefault(definition: ProviderDefinition | undefined, key: string): string {
  return definition?.fields.find((field) => field.key === key)?.defaultValue ?? '';
}

export function configToFormState(
  config: ProviderConfigView | undefined,
  definition: ProviderDefinition | undefined,
): ProviderFormState {
  return {
    url: config?.url ?? getFieldDefault(definition, 'url'),
    model: config?.model ?? getFieldDefault(definition, 'model'),
    newApiKey: '',
    clearApiKey: false,
  };
}

export function formsEqual(left: ProviderFormState, right: ProviderFormState): boolean {
  return (
    left.url === right.url &&
    left.model === right.model &&
    left.newApiKey === right.newApiKey &&
    left.clearApiKey === right.clearApiKey
  );
}

export function toProviderKeyChange(form: ProviderFormState): { apiKey?: string } {
  const newApiKey = form.newApiKey.trim();

  if (newApiKey.length > 0) return { apiKey: newApiKey };
  if (form.clearApiKey) return { apiKey: '' };
  return {};
}

export function toProviderSettingsPatch(provider: ProviderType, form: ProviderFormState): PatchProviderSettingsCommand {
  return {
    activeProvider: provider,
    config: {
      url: form.url.trim(),
      model: form.model.trim(),
      ...toProviderKeyChange(form),
    },
  };
}
