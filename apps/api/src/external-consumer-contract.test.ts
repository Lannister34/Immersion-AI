import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';

import {
  ComfyUiGenerationReadinessFixtureSchema,
  ComfyUiRuntimeOverviewFixtureSchema,
} from './test-support/comfyui-node-response-fixture-schemas.js';
import {
  OpenAiChatCompletionFixtureSchema,
  OpenAiModelListFixtureSchema,
} from './test-support/openai-response-fixture-schemas.js';
import { buildPng } from './test-support/png-image.js';
import { readProviderChatRequest } from './test-support/provider-chat-request.js';
import type { ProviderChatRequestFixture } from './test-support/provider-chat-request-fixture-schema.js';
import {
  type ProviderContentPartsFixture,
  ProviderContentPartsFixtureSchema,
} from './test-support/provider-content-parts-fixture-schema.js';
import { openAiChatCompletion, providerFailure } from './test-support/provider-responses.js';
import { requestOverSocket, type SocketResponse } from './test-support/socket-request.js';
import { useTestApi } from './test-support/use-test-api.js';

const PROVIDER_URL = 'http://127.0.0.1:6014';
const PROVIDER_CHAT_URL = `${PROVIDER_URL}/v1/chat/completions`;
const PROVIDER_MODEL = 'qwen3-vl-8b-instruct';
const PYTHON_URLLIB_HEADERS = {
  'Accept-Encoding': 'identity',
  Connection: 'close',
  Host: '127.0.0.1:4787',
  'User-Agent': 'Python-urllib/3.12',
};
const MODELS_DIRECTORY_NAME = 'модели ComfyUI';
const VISION_MODEL = 'Qwen3-VL-8B-Instruct-Q4_K_M.gguf';
const VISION_PROJECTOR = 'mmproj-Qwen3-VL-8B-Instruct-F16.gguf';
const TEXT_MODEL = 'Llama-3-8B-Instruct-Q4_K_M.gguf';
const THINKING_OFF = { enable_thinking: false };

type HttpMethod = 'GET' | 'POST';

interface ContentPart {
  readonly type: 'image_url' | 'text';
  readonly image_url?: { readonly url: string };
  readonly text?: string;
}

interface ChatTurn {
  readonly role: 'assistant' | 'user';
  readonly content: string;
}

const SLOT_RESPONSE_FORMAT = {
  json_schema: {
    name: 'slots',
    schema: {
      additionalProperties: false,
      properties: { mood: { type: 'string' } },
      required: ['mood'],
      type: 'object',
    },
    strict: true,
  },
  type: 'json_schema',
};

function pngDataUrl(width: number, height: number): string {
  return `data:image/png;base64,${buildPng({ height, width }).toString('base64')}`;
}

function imagePart(url: string): ContentPart {
  return { image_url: { url }, type: 'image_url' };
}

function textPart(text: string): ContentPart {
  return { text, type: 'text' };
}

function visionProbeBody(pixel: string) {
  return {
    chat_template_kwargs: THINKING_OFF,
    max_tokens: 8,
    messages: [{ content: [imagePart(pixel), textPart('ok?')], role: 'user' }],
  };
}

function h3PrompterBody(userContent: readonly ContentPart[], laterTurns: readonly ChatTurn[] = []) {
  return {
    chat_template_kwargs: THINKING_OFF,
    enable_thinking: false,
    max_tokens: 4096,
    messages: [
      { content: 'You write MiniMax H3 prompts.', role: 'system' },
      { content: userContent, role: 'user' },
      ...laterTurns,
    ],
    seed: 2_147_483_647,
    temperature: 0.7,
  };
}

function qwenPrompterBody(maxTokens: number) {
  return {
    chat_template_kwargs: { enable_thinking: true },
    max_tokens: maxTokens,
    messages: [
      { content: 'You rewrite image prompts.', role: 'system' },
      { content: 'Тихая гавань на рассвете.\n\n(Write the rewritten prompt in English.)', role: 'user' },
    ],
    min_p: 0,
    presence_penalty: 1.5,
    seed: 0,
    temperature: 0.85,
    top_k: 20,
    top_p: 0.95,
  };
}

function readAsTheNode<T>(response: SocketResponse, schema: ZodType<T>): T {
  expect(response.status, response.body).toBe(200);

  return schema.parse(JSON.parse(response.body));
}

function expectAnErrorStatus(response: SocketResponse): void {
  expect(response.status, response.body).toBeGreaterThanOrEqual(400);
  expect(response.status, response.body).toBeLessThan(600);
}

function contentPartsOf(
  message: ProviderChatRequestFixture['messages'][number] | undefined,
): ProviderContentPartsFixture {
  return ProviderContentPartsFixtureSchema.parse(message?.content);
}

function userPartsOf(request: ProviderChatRequestFixture): ProviderContentPartsFixture {
  return contentPartsOf(request.messages.find((message) => message.role === 'user'));
}

function imageUrlsOf(parts: ProviderContentPartsFixture): string[] {
  return parts.flatMap((part) => part.image_url?.url ?? []);
}

function joinedTextOf(parts: ProviderContentPartsFixture): string {
  return parts.flatMap((part) => part.text ?? []).join('\n');
}

function jsonEscaped(text: string): string {
  return JSON.stringify(text).slice(1, -1);
}

describe('ComfyUI node pack replay in external mode: success shapes change only additively, failures owe only a 4xx or 5xx status', () => {
  const api = useTestApi();

  function modelsDirectory(): string {
    return path.join(api().dataRoot, MODELS_DIRECTORY_NAME);
  }

  async function callAsTheNode(method: HttpMethod, route: string, json?: unknown): Promise<SocketResponse> {
    const origin = await api().listen();

    return requestOverSocket(`${origin}${route}`, { headers: PYTHON_URLLIB_HEADERS, json, method });
  }

  beforeEach(async () => {
    const { settings } = api();
    await fs.mkdir(modelsDirectory(), { recursive: true });
    await Promise.all(
      [VISION_MODEL, VISION_PROJECTOR, TEXT_MODEL].map((name) =>
        fs.writeFile(path.join(modelsDirectory(), name), 'gguf'),
      ),
    );
    await settings.patch({ llmServerConfig: { modelsDirs: [modelsDirectory()] } });
    await settings.useExternalProvider({ model: PROVIDER_MODEL, url: PROVIDER_URL });
  });

  describe('runtime lifecycle as the ComfyUI nodes drive it', () => {
    function startBodyForAMissingModel() {
      const modelPath = path.join(modelsDirectory(), 'Удалённая-модель-Q4_K_M.gguf');
      const mmprojPath = path.join(modelsDirectory(), 'mmproj-Удалённая-модель-F16.gguf');

      expect(existsSync(modelPath), 'a start test must never name an existing model').toBe(false);

      return {
        contextSize: 32_768,
        flashAttention: true,
        gpuLayers: 999,
        mmprojPath,
        modelPath,
        port: 5001,
        threads: 0,
      };
    }

    it('serves the runtime overview fields llm_load reads: models in order with their projector, and the server status', async () => {
      const overview = readAsTheNode(
        await callAsTheNode('GET', '/api/runtime/overview'),
        ComfyUiRuntimeOverviewFixtureSchema,
      );
      const selectable = overview.models.filter((model) => !model.name.toLowerCase().includes('mmproj'));

      expect(
        selectable.map(({ name, path: modelPath, visionProjectorPath }) => ({ modelPath, name, visionProjectorPath })),
      ).toEqual([
        { modelPath: path.join(modelsDirectory(), TEXT_MODEL), name: TEXT_MODEL, visionProjectorPath: null },
        {
          modelPath: path.join(modelsDirectory(), VISION_MODEL),
          name: VISION_MODEL,
          visionProjectorPath: path.join(modelsDirectory(), VISION_PROJECTOR),
        },
      ]);
      expect(overview.serverStatus).toMatchObject({ error: null, modelPath: null, status: 'idle' });
    });

    it('answers the {} stop llm_unload sends with 200 and a JSON body while nothing runs, then serves the idle status it polls', async () => {
      const stopped = await callAsTheNode('POST', '/api/runtime/stop', {});
      const overview = readAsTheNode(
        await callAsTheNode('GET', '/api/runtime/overview'),
        ComfyUiRuntimeOverviewFixtureSchema,
      );

      expect(stopped.status, stopped.body).toBe(200);
      expect(() => JSON.parse(stopped.body)).not.toThrow();
      expect(overview.serverStatus.status).toBe('idle');
    });

    it('carries the start body llm_load sends up to the model check, whose refusal names the missing model before anything launches', async () => {
      const body = startBodyForAMissingModel();

      const response = await callAsTheNode('POST', '/api/runtime/start', body);

      expectAnErrorStatus(response);
      expect(response.body).toContain(jsonEscaped(body.modelPath));
    });
  });

  describe('generation readiness and /v1 as the ComfyUI nodes call them', () => {
    it('reports readiness mode and vision support', async () => {
      api().http.on('GET', `${PROVIDER_URL}/props`, () => Response.json({ modalities: { vision: true } }));

      const readiness = readAsTheNode(
        await callAsTheNode('GET', '/api/generation/readiness'),
        ComfyUiGenerationReadinessFixtureSchema,
      );

      expect(readiness).toMatchObject({ mode: 'external', visionSupport: 'supported' });
    });

    it('lists the served model on /v1/models, which llm_load polls before it calls the model ready', async () => {
      api().http.on('GET', `${PROVIDER_URL}/v1/models`, () => Response.json({ data: [{ id: PROVIDER_MODEL }] }));

      const models = readAsTheNode(await callAsTheNode('GET', '/v1/models'), OpenAiModelListFixtureSchema);

      expect(models.data.map((model) => model.id)).toEqual([PROVIDER_MODEL]);
    });

    it('answers the one-pixel vision probe llm_load sends before it trusts a running server', async () => {
      api().http.on('POST', PROVIDER_CHAT_URL, () => openAiChatCompletion('ok'));
      const pixel = pngDataUrl(1, 1);

      const completion = readAsTheNode(
        await callAsTheNode('POST', '/v1/chat/completions', visionProbeBody(pixel)),
        OpenAiChatCompletionFixtureSchema,
      );
      const sent = readProviderChatRequest(api().http);

      expect(completion.choices[0].message.content).toBe('ok');
      expect(imageUrlsOf(userPartsOf(sent))).toEqual([pixel]);
      expect(sent).toMatchObject({ chat_template_kwargs: THINKING_OFF, max_tokens: 8 });
    });

    it('completes the images-first request h3_prompter sends, delivering its images in order, its text, its sampling and the thinking switch', async () => {
      api().http.on('POST', PROVIDER_CHAT_URL, () => openAiChatCompletion('Девушка у окна, мягкий утренний свет.'));
      const references = [pngDataUrl(2, 1), pngDataUrl(1, 2)];
      const legend = 'The first 2 image(s) are <Picture 1>..<Picture 2>, in that order.';
      const request = 'Idea: девушка у окна\nDuration: 6s';

      const completion = readAsTheNode(
        await callAsTheNode(
          'POST',
          '/v1/chat/completions',
          h3PrompterBody([...references.map(imagePart), textPart(legend), textPart(request)]),
        ),
        OpenAiChatCompletionFixtureSchema,
      );
      const sent = readProviderChatRequest(api().http);
      const sentParts = userPartsOf(sent);
      const sentText = joinedTextOf(sentParts);

      expect(completion.choices[0]).toMatchObject({
        finish_reason: 'stop',
        message: { content: 'Девушка у окна, мягкий утренний свет.' },
      });
      expect(imageUrlsOf(sentParts)).toEqual(references);
      expect(sentText).toContain(legend);
      expect(sentText).toContain(request);
      expect(sent).toMatchObject({
        chat_template_kwargs: THINKING_OFF,
        enable_thinking: false,
        max_tokens: 4096,
        seed: 2_147_483_647,
        temperature: 0.7,
      });
    });

    it('passes the slot schema of an h3_prompter concept request to the provider as response_format', async () => {
      api().http.on('POST', PROVIDER_CHAT_URL, () => openAiChatCompletion('{"mood":"тихая грусть"}'));

      const completion = readAsTheNode(
        await callAsTheNode('POST', '/v1/chat/completions', {
          ...h3PrompterBody([imagePart(pngDataUrl(1, 1)), textPart('Fill the open slots.')]),
          response_format: SLOT_RESPONSE_FORMAT,
        }),
        OpenAiChatCompletionFixtureSchema,
      );

      expect(completion.choices[0].message.content).toBe('{"mood":"тихая грусть"}');
      expect(readProviderChatRequest(api().http)).toMatchObject({ response_format: SLOT_RESPONSE_FORMAT });
    });

    it('completes the retry h3_prompter sends after rejecting a slot answer, keeping the first turn images, both later turns in order and the slot schema', async () => {
      api().http.on('POST', PROVIDER_CHAT_URL, () => openAiChatCompletion('{"mood":"тихая грусть"}'));
      const references = [pngDataUrl(2, 1), pngDataUrl(1, 2)];
      const slotRequest = 'Fill the open slots: mood.';
      const rejectedAnswer: ChatTurn = { content: '{"mood": 7}', role: 'assistant' };
      const objection: ChatTurn = {
        content: 'That answer was rejected: mood must be a string. Return the corrected JSON object only.',
        role: 'user',
      };

      const completion = readAsTheNode(
        await callAsTheNode('POST', '/v1/chat/completions', {
          ...h3PrompterBody([...references.map(imagePart), textPart(slotRequest)], [rejectedAnswer, objection]),
          response_format: SLOT_RESPONSE_FORMAT,
        }),
        OpenAiChatCompletionFixtureSchema,
      );
      const sent = readProviderChatRequest(api().http);
      const firstUserParts = contentPartsOf(sent.messages[1]);

      expect(completion.choices[0].message.content).toBe('{"mood":"тихая грусть"}');
      expect(sent.messages.map((message) => message.role)).toEqual(['system', 'user', 'assistant', 'user']);
      expect(imageUrlsOf(firstUserParts)).toEqual(references);
      expect(joinedTextOf(firstUserParts)).toContain(slotRequest);
      expect(sent.messages.slice(2)).toEqual([rejectedAnswer, objection]);
      expect(sent).toMatchObject({
        chat_template_kwargs: THINKING_OFF,
        max_tokens: 4096,
        response_format: SLOT_RESPONSE_FORMAT,
        seed: 2_147_483_647,
        temperature: 0.7,
      });
    });

    it('completes the plain-text request qwen21_prompter sends, keeping thinking out of the content and honouring its top_p and presence_penalty', async () => {
      api().http.on('POST', PROVIDER_CHAT_URL, () =>
        openAiChatCompletion('<think>Гавань, рассвет, тишина.</think>{"rewritten_prompt":"A quiet harbour at dawn."}'),
      );
      const body = qwenPrompterBody(16_256);

      const completion = readAsTheNode(
        await callAsTheNode('POST', '/v1/chat/completions', body),
        OpenAiChatCompletionFixtureSchema,
      );
      const sent = readProviderChatRequest(api().http);

      expect(completion.choices[0].message.content).toBe('{"rewritten_prompt":"A quiet harbour at dawn."}');
      expect(sent.messages).toEqual(body.messages);
      expect(sent).toMatchObject({
        chat_template_kwargs: { enable_thinking: true },
        max_tokens: 16_256,
        presence_penalty: 1.5,
        seed: 0,
        temperature: 0.85,
        top_p: 0.95,
      });
    });

    it('answers a reply that thinking used up with empty content and finish_reason length, which the nodes report', async () => {
      api().http.on('POST', PROVIDER_CHAT_URL, () => openAiChatCompletion('<think>Сначала взвешу варианты'));

      const completion = readAsTheNode(
        await callAsTheNode('POST', '/v1/chat/completions', qwenPrompterBody(64)),
        OpenAiChatCompletionFixtureSchema,
      );

      expect(completion.choices[0]).toMatchObject({ finish_reason: 'length', message: { content: '' } });
    });

    it('answers a provider failure on /v1 with an error status, so the vision probe reads it as no vision', async () => {
      api().http.on('POST', PROVIDER_CHAT_URL, () => providerFailure());

      expectAnErrorStatus(await callAsTheNode('POST', '/v1/chat/completions', visionProbeBody(pngDataUrl(1, 1))));
    });

    it('answers /v1 with an error status while the provider URL is blank, without calling any provider', async () => {
      await api().settings.useExternalProvider({ model: PROVIDER_MODEL, url: '' });

      const response = await callAsTheNode('POST', '/v1/chat/completions', h3PrompterBody([textPart('Idea: пусто')]));

      expectAnErrorStatus(response);
      expect(api().http.requestLines()).toEqual([]);
    });
  });
});
