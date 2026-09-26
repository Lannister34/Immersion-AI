import type { ProviderApiKind, ProviderDefinition, ProviderType } from '@immersion/contracts/providers';

export const providerDefinitions: ProviderDefinition[] = [
  {
    apiKind: 'openai-compatible',
    type: 'koboldcpp',
    label: 'KoboldCpp API',
    fields: [
      {
        key: 'url',
        type: 'text',
        required: true,
        placeholder: 'http://127.0.0.1:5001',
        defaultValue: 'http://127.0.0.1:5001',
      },
      {
        key: 'model',
        type: 'text',
        required: false,
        placeholder: 'local-model',
        defaultValue: 'local-model',
      },
    ],
  },
  {
    apiKind: 'openai-compatible',
    type: 'custom',
    label: 'OpenAI-совместимый API',
    fields: [
      {
        key: 'url',
        type: 'text',
        required: true,
        placeholder: 'http://127.0.0.1:5001',
        defaultValue: 'http://127.0.0.1:5001',
      },
      {
        key: 'apiKey',
        type: 'password',
        required: false,
      },
      {
        key: 'model',
        type: 'text',
        required: false,
        placeholder: 'local-model',
        defaultValue: 'local-model',
      },
    ],
  },
  {
    apiKind: 'openai-cloud',
    type: 'openai',
    label: 'OpenAI API',
    fields: [
      {
        key: 'url',
        type: 'text',
        required: true,
        placeholder: 'https://api.openai.com/v1',
        defaultValue: 'https://api.openai.com/v1',
      },
      {
        key: 'apiKey',
        type: 'password',
        required: true,
        placeholder: 'sk-…',
      },
      {
        key: 'model',
        type: 'text',
        required: true,
        placeholder: 'gpt-4o',
      },
    ],
  },
  {
    apiKind: 'anthropic',
    type: 'anthropic',
    label: 'Anthropic API (Claude)',
    fields: [
      {
        key: 'url',
        type: 'text',
        required: true,
        placeholder: 'https://api.anthropic.com/v1',
        defaultValue: 'https://api.anthropic.com/v1',
      },
      {
        key: 'apiKey',
        type: 'password',
        required: true,
        placeholder: 'sk-ant-…',
      },
      {
        key: 'model',
        type: 'text',
        required: true,
        placeholder: 'claude-sonnet-4-5',
      },
    ],
  },
];

const definitionsByType = new Map<ProviderType, ProviderDefinition>(
  providerDefinitions.map((definition) => [definition.type, definition]),
);

function getProviderDefinition(type: ProviderType): ProviderDefinition {
  const definition = definitionsByType.get(type);

  if (!definition) {
    throw new Error(`Unknown provider type: ${type}`);
  }

  return definition;
}

export function getProviderApiKind(type: ProviderType): ProviderApiKind {
  return getProviderDefinition(type).apiKind;
}

export function isProviderApiKeyRequired(type: ProviderType): boolean {
  return getProviderDefinition(type).fields.some((field) => field.key === 'apiKey' && field.required);
}

export function getProviderDefaultModel(type: ProviderType): string | null {
  return getProviderDefinition(type).fields.find((field) => field.key === 'model')?.defaultValue ?? null;
}

export function getProviderDefaultUrl(type: ProviderType): string {
  const url = getProviderDefinition(type).fields.find((field) => field.key === 'url')?.defaultValue;

  if (!url) {
    throw new Error(`Provider ${type} has no default URL.`);
  }

  return url;
}
