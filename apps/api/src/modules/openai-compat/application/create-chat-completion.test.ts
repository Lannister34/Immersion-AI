import { describe, expect, it } from 'vitest';

import { FakeChatCompletionClient } from '../../../test-support/fake-chat-completion-client.js';
import type { ChatCompletionEndpoint } from '../../generation/index.js';
import type { TokenCounter } from '../../prompting/index.js';
import { OpenAiChatCompletionRequestSchema } from '../domain/openai-chat-completion-request-schema.js';
import { UnsupportedOpenAiFeatureError } from '../domain/unsupported-openai-feature-error.js';
import { createOpenAiChatCompletion, type OpenAiChatCompletionDependencies } from './create-chat-completion.js';
import type { OpenAiCompatSamplerPreset } from './openai-compat-ports.js';

const CONFIGURED_ENDPOINT: ChatCompletionEndpoint = {
  apiKey: null,
  apiKind: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:6007',
  model: 'настроенная-модель',
};

const PRESET: OpenAiCompatSamplerPreset = {
  maxTokens: 300,
  minP: 0.05,
  presencePenalty: 0,
  repeatPenalty: 1.1,
  repeatPenaltyRange: 64,
  temperature: 0.7,
  topK: 40,
  topP: 0.9,
};

const characterCounter: TokenCounter = {
  countTokens: (texts) => Promise.resolve({ counts: texts.map((text) => text.length), method: 'exact' }),
};

interface InMemoryPorts {
  readonly client: FakeChatCompletionClient;
  readonly presetRequests: string[];
  readonly dependencies: OpenAiChatCompletionDependencies;
}

function createInMemoryPorts(): InMemoryPorts {
  const client = new FakeChatCompletionClient();
  const presetRequests: string[] = [];

  return {
    client,
    presetRequests,
    dependencies: {
      chatCompletionClient: client,
      providers: { resolveGenerationProviderEndpoint: () => Promise.resolve(CONFIGURED_ENDPOINT) },
      settings: {
        resolveSamplerPresetForModel: (modelName) => {
          presetRequests.push(modelName);

          return PRESET;
        },
      },
      tokenCounter: characterCounter,
    },
  };
}

function command(fields: Record<string, unknown>) {
  return OpenAiChatCompletionRequestSchema.parse({ messages: [{ content: 'Привет.', role: 'user' }], ...fields });
}

describe('createOpenAiChatCompletion', () => {
  it('request sampling overrides beat the preset', async () => {
    const { client, dependencies } = createInMemoryPorts();
    client.reply({ content: 'ок' });

    await createOpenAiChatCompletion(
      command({ max_tokens: 42, presence_penalty: 1.1, temperature: 1.3, top_p: 0.5 }),
      dependencies,
    );

    expect(client.requests[0]?.maxTokens).toBe(42);
    expect(client.requests[0]?.sampling).toEqual({
      minP: PRESET.minP,
      presencePenalty: 1.1,
      repeatPenalty: PRESET.repeatPenalty,
      repeatPenaltyRange: PRESET.repeatPenaltyRange,
      temperature: 1.3,
      topK: PRESET.topK,
      topP: 0.5,
    });
  });

  it('passes the model through as given', async () => {
    const { client, dependencies, presetRequests } = createInMemoryPorts();
    client.reply({ content: 'ок' });

    const result = await createOpenAiChatCompletion(command({ model: 'Qwen3-VL-8B-Instruct' }), dependencies);

    expect(client.requests[0]?.endpoint).toEqual({ ...CONFIGURED_ENDPOINT, model: 'Qwen3-VL-8B-Instruct' });
    expect(presetRequests).toEqual(['Qwen3-VL-8B-Instruct']);
    expect(result.model).toBe('Qwen3-VL-8B-Instruct');
  });

  it('refuses n > 1', async () => {
    const { client, dependencies } = createInMemoryPorts();

    await expect(createOpenAiChatCompletion(command({ n: 2 }), dependencies)).rejects.toBeInstanceOf(
      UnsupportedOpenAiFeatureError,
    );
    expect(client.requests).toEqual([]);
  });

  it('counts usage with the injected token counter', async () => {
    const { client, dependencies } = createInMemoryPorts();
    client.reply({ content: 'Здравствуй!', reasoning: 'думаю' });

    const result = await createOpenAiChatCompletion(
      command({
        messages: [
          { content: 'Кратко.', role: 'system' },
          { content: 'Привет.', role: 'user' },
        ],
      }),
      dependencies,
    );

    expect(result).toEqual({
      content: 'Здравствуй!',
      model: CONFIGURED_ENDPOINT.model,
      reasoning: 'думаю',
      usage: { completionTokens: 'Здравствуй!'.length, promptTokens: 'Кратко.'.length + 'Привет.'.length },
    });
  });
});
