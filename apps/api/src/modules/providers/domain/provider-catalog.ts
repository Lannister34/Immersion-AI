import {
  type ProviderApiKind,
  type ProviderDefinition,
  type ProviderField,
  type ProviderType,
  ProviderTypeSchema,
} from '@immersion/contracts/providers';

interface ProviderCatalogEntry {
  readonly apiKind: ProviderApiKind;
  readonly label: string;
  readonly url: { readonly defaultValue: string; readonly placeholder: string };
  readonly apiKey: { readonly required: boolean; readonly placeholder?: string } | null;
  readonly model: { readonly defaultValue: string | null; readonly placeholder: string; readonly required: boolean };
}

const providerCatalog = {
  koboldcpp: {
    apiKind: 'openai-compatible',
    label: 'KoboldCpp API',
    url: { defaultValue: 'http://127.0.0.1:5001', placeholder: 'http://127.0.0.1:5001' },
    apiKey: null,
    model: { defaultValue: 'local-model', placeholder: 'local-model', required: false },
  },
  custom: {
    apiKind: 'openai-compatible',
    label: 'OpenAI-совместимый API',
    url: { defaultValue: 'http://127.0.0.1:5001', placeholder: 'http://127.0.0.1:5001' },
    apiKey: { required: false },
    model: { defaultValue: 'local-model', placeholder: 'local-model', required: false },
  },
  openai: {
    apiKind: 'openai-cloud',
    label: 'OpenAI API',
    url: { defaultValue: 'https://api.openai.com/v1', placeholder: 'https://api.openai.com/v1' },
    apiKey: { required: true, placeholder: 'sk-…' },
    model: { defaultValue: null, placeholder: 'gpt-4o', required: true },
  },
  anthropic: {
    apiKind: 'anthropic',
    label: 'Anthropic API (Claude)',
    url: { defaultValue: 'https://api.anthropic.com/v1', placeholder: 'https://api.anthropic.com/v1' },
    apiKey: { required: true, placeholder: 'sk-ant-…' },
    model: { defaultValue: null, placeholder: 'claude-sonnet-4-5', required: true },
  },
} satisfies Record<ProviderType, ProviderCatalogEntry>;

function toProviderFields(entry: ProviderCatalogEntry): ProviderField[] {
  const urlField: ProviderField = {
    key: 'url',
    type: 'text',
    required: true,
    placeholder: entry.url.placeholder,
    defaultValue: entry.url.defaultValue,
  };
  const modelField: ProviderField = {
    key: 'model',
    type: 'text',
    required: entry.model.required,
    placeholder: entry.model.placeholder,
    ...(entry.model.defaultValue === null ? {} : { defaultValue: entry.model.defaultValue }),
  };

  if (entry.apiKey === null) {
    return [urlField, modelField];
  }

  const apiKeyField: ProviderField = {
    key: 'apiKey',
    type: 'password',
    required: entry.apiKey.required,
    ...(entry.apiKey.placeholder === undefined ? {} : { placeholder: entry.apiKey.placeholder }),
  };

  return [urlField, apiKeyField, modelField];
}

function toProviderDefinition(type: ProviderType, entry: ProviderCatalogEntry): ProviderDefinition {
  return {
    apiKind: entry.apiKind,
    type,
    label: entry.label,
    fields: toProviderFields(entry),
  };
}

export const providerDefinitions: readonly ProviderDefinition[] = ProviderTypeSchema.options.map((type) =>
  toProviderDefinition(type, providerCatalog[type]),
);

export function getProviderApiKind(type: ProviderType): ProviderApiKind {
  return providerCatalog[type].apiKind;
}

export function isProviderApiKeyRequired(type: ProviderType): boolean {
  return providerCatalog[type].apiKey?.required === true;
}

export function getProviderDefaultModel(type: ProviderType): string | null {
  return providerCatalog[type].model.defaultValue;
}

export function getProviderDefaultUrl(type: ProviderType): string {
  return providerCatalog[type].url.defaultValue;
}
