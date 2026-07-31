import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import {
  GenerateCharacterAvatarPromptResponseSchema,
  GenerateCharacterDraftResponseSchema,
  GenerateCharacterFieldResponseSchema,
  GenerateLorebookDraftResponseSchema,
  GenerateScenarioDraftResponseSchema,
  GenerateScenarioFirstMessageResponseSchema,
} from '@immersion/contracts/generation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApiApp } from './app.js';

const fixtureDataRoot = fileURLToPath(new URL('../testdata/smoke-data', import.meta.url));

interface ProviderRequestRecord {
  authorization: string | null;
  body: unknown;
  url: string;
}

interface ProviderRequestMessageRecord {
  content?: string;
  role?: string;
}

interface ProviderRequestBodyRecord {
  max_tokens?: number;
  messages?: ProviderRequestMessageRecord[];
  stream?: boolean;
  temperature?: number;
}

interface SmokeUserSettingsFixture {
  activeProvider?: string;
  backendMode?: string;
  providerConfigs?: Record<string, Record<string, string>>;
}

describe('generation draft routes', () => {
  let previousDataRoot: string | undefined;
  let temporaryDataRoot: string;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    previousDataRoot = process.env.IMMERSION_DATA_ROOT;
    temporaryDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-api-generation-drafts-'));
    await fs.cp(fixtureDataRoot, temporaryDataRoot, { recursive: true });
    process.env.IMMERSION_DATA_ROOT = temporaryDataRoot;
    await writeExternalProviderSettings('http://127.0.0.1:6006');
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();

    if (previousDataRoot) {
      process.env.IMMERSION_DATA_ROOT = previousDataRoot;
    } else {
      delete process.env.IMMERSION_DATA_ROOT;
    }

    await fs.rm(temporaryDataRoot, { recursive: true, force: true });
  });

  function mockProviderSuccess(content: string) {
    const requests: ProviderRequestRecord[] = [];

    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      requests.push({
        authorization: headers.get('authorization'),
        body,
        url: input instanceof Request ? input.url : input.toString(),
      });

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content,
              },
            },
          ],
        }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 200,
        },
      );
    }) as typeof fetch;

    return requests;
  }

  function mockProviderFailure() {
    const requests: ProviderRequestRecord[] = [];

    globalThis.fetch = vi.fn(async () => {
      requests.push({
        authorization: null,
        body: null,
        url: 'mock-provider-failure',
      });

      return new Response(JSON.stringify({ error: 'provider failed' }), {
        headers: {
          'Content-Type': 'application/json',
        },
        status: 500,
      });
    }) as typeof fetch;

    return requests;
  }

  async function writeExternalProviderSettings(url: string, model = 'smoke-model') {
    const settingsPath = path.join(temporaryDataRoot, 'user-settings.json');
    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as SmokeUserSettingsFixture;
    const providerConfigs = settings.providerConfigs ?? {};

    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          ...settings,
          activeProvider: 'custom',
          backendMode: 'external',
          providerConfigs: {
            ...providerConfigs,
            custom: {
              ...providerConfigs.custom,
              apiKey: 'secret-token',
              model,
              url,
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  async function writeBuiltinProviderSettings() {
    const settingsPath = path.join(temporaryDataRoot, 'user-settings.json');
    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as SmokeUserSettingsFixture;

    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          ...settings,
          backendMode: 'builtin',
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  function getProviderRequestBody(request: ProviderRequestRecord | undefined): ProviderRequestBodyRecord {
    if (!request?.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
      throw new Error('Provider request body was not recorded.');
    }

    return request.body as ProviderRequestBodyRecord;
  }

  function fenced(json: object): string {
    return `Вот результат:\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\nГотово.`;
  }

  describe('POST /api/generation/character', () => {
    it('generates a character draft from code-fenced provider JSON', async () => {
      const providerRequests = mockProviderSuccess(
        fenced({
          name: 'Мира',
          description: 'Высокая, тёмные волосы, серые глаза.',
          personality: 'Спокойная и наблюдательная.',
          scenario: '{{user}} заходит в мастерскую {{char}}.',
          firstMessage: '*{{char}} поднимает взгляд от станка.* Привет, {{user}}!',
          exampleDialogue: '<START>\n{{user}}: привет\n{{char}}: привет',
          tags: ['фэнтези', 'мастерская'],
        }),
      );
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/character',
        payload: {
          concept: 'Молодая скульпторша из Петербурга',
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = GenerateCharacterDraftResponseSchema.parse(response.json());
      expect(payload).toMatchObject({
        name: 'Мира',
        description: 'Высокая, тёмные волосы, серые глаза.',
        personality: 'Спокойная и наблюдательная.',
        scenario: '{{user}} заходит в мастерскую {{char}}.',
        firstMessage: '*{{char}} поднимает взгляд от станка.* Привет, {{user}}!',
        exampleDialogue: '<START>\n{{user}}: привет\n{{char}}: привет',
        tags: ['фэнтези', 'мастерская'],
      });

      expect(providerRequests).toHaveLength(1);
      expect(providerRequests[0]).toMatchObject({
        authorization: 'Bearer secret-token',
        url: 'http://127.0.0.1:6006/v1/chat/completions',
      });
      const requestBody = getProviderRequestBody(providerRequests[0]);
      // smoke-model is bound to smoke-model-preset (temperature 0.44) in the fixture.
      expect(requestBody).toMatchObject({
        max_tokens: 2048,
        stream: false,
        temperature: 0.44,
      });
      const submittedContent = requestBody.messages?.map((message) => message.content).join('\n') ?? '';
      expect(submittedContent).toContain('Молодая скульпторша из Петербурга');
      // Fixture profile responseLanguage is 'ru'.
      expect(submittedContent).toContain('Пиши на русском.');

      await app.close();
    });

    it('keeps caller-provided fields over generated values and mentions them in the prompt', async () => {
      const providerRequests = mockProviderSuccess(
        fenced({
          name: 'Сгенерированное имя',
          description: 'Сгенерированное описание.',
          personality: 'Сгенерированный характер.',
          scenario: '',
          firstMessage: '',
          exampleDialogue: '',
          tags: [],
        }),
      );
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/character',
        payload: {
          concept: 'Детектив в нуарном городе',
          fields: {
            name: 'Виктор Крамер',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = GenerateCharacterDraftResponseSchema.parse(response.json());
      expect(payload.name).toBe('Виктор Крамер');
      expect(payload.description).toBe('Сгенерированное описание.');

      const requestBody = getProviderRequestBody(providerRequests[0]);
      const submittedContent = requestBody.messages?.map((message) => message.content).join('\n') ?? '';
      expect(submittedContent).toContain('Виктор Крамер');

      await app.close();
    });

    it('returns 502 provider_generation_failed for unparseable provider output', async () => {
      mockProviderSuccess('Просто текст без какого-либо JSON.');
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/character',
        payload: {
          concept: 'Детектив',
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });

      await app.close();
    });

    it('returns 409 generation_provider_unavailable when no provider endpoint can be resolved', async () => {
      await writeBuiltinProviderSettings();
      const providerRequests = mockProviderSuccess('Should not be called.');
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/character',
        payload: {
          concept: 'Детектив',
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'generation_provider_unavailable' });
      expect(providerRequests).toHaveLength(0);

      await app.close();
    });

    it('returns 400 validation_error without a concept and does not call the provider', async () => {
      const providerRequests = mockProviderSuccess('Should not be called.');
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/character',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'validation_error' });
      expect(providerRequests).toHaveLength(0);

      await app.close();
    });
  });

  describe('POST /api/generation/character-field', () => {
    it('generates a single field value as plain text', async () => {
      const providerRequests = mockProviderSuccess('\nВысокая женщина с серебристыми волосами.\n');
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/character-field',
        payload: {
          field: 'description',
          concept: 'Эльфийка-архивариус',
          current: {
            name: 'Лириэль',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = GenerateCharacterFieldResponseSchema.parse(response.json());
      expect(payload.value).toBe('Высокая женщина с серебристыми волосами.');

      expect(providerRequests).toHaveLength(1);
      const requestBody = getProviderRequestBody(providerRequests[0]);
      expect(requestBody).toMatchObject({
        max_tokens: 1024,
        stream: false,
        temperature: 0.44,
      });
      const submittedContent = requestBody.messages?.map((message) => message.content).join('\n') ?? '';
      expect(submittedContent).toContain('Сгенерируй поле "description"');
      expect(submittedContent).toContain('Лириэль');
      expect(submittedContent).toContain('Эльфийка-архивариус');

      await app.close();
    });

    it('raises the temperature when regenerating an already filled field', async () => {
      const providerRequests = mockProviderSuccess('Совсем другой вариант описания.');
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/character-field',
        payload: {
          field: 'description',
          current: {
            description: 'Старое описание.',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const requestBody = getProviderRequestBody(providerRequests[0]);
      expect(requestBody.temperature).toBe(1.1);
      const submittedContent = requestBody.messages?.map((message) => message.content).join('\n') ?? '';
      expect(submittedContent).toContain('НОВЫЙ, ДРУГОЙ вариант');
      // Модель должна видеть предыдущий вариант, иначе «не повторяй» невыполнимо.
      expect(submittedContent).toContain('не повторяй его');
      expect(submittedContent).toContain('Старое описание.');

      await app.close();
    });

    it('embeds the previous value when regenerating fields outside the card summary block', async () => {
      const providerRequests = mockProviderSuccess('*Дверь распахивается.* Совсем новое вступление.');
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/character-field',
        payload: {
          field: 'firstMessage',
          current: {
            firstMessage: 'Старая первая фраза, которую нельзя повторять.',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const requestBody = getProviderRequestBody(providerRequests[0]);
      const submittedContent = requestBody.messages?.map((message) => message.content).join('\n') ?? '';
      expect(submittedContent).toContain('Старая первая фраза, которую нельзя повторять.');

      await app.close();
    });

    it('caps generated personality at the character save limit', async () => {
      mockProviderSuccess(`Черта. ${'очень длинный текст '.repeat(400)}`);
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/character-field',
        payload: {
          field: 'personality',
          current: {},
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = GenerateCharacterFieldResponseSchema.parse(response.json());
      // SaveCharacterCommandSchema ограничивает personality 5000 символами.
      expect(payload.value.length).toBeLessThanOrEqual(5000);

      await app.close();
    });

    it('returns 502 provider_generation_failed when the provider fails', async () => {
      const providerRequests = mockProviderFailure();
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/character-field',
        payload: {
          field: 'personality',
          current: {},
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });
      expect(providerRequests).toHaveLength(1);

      await app.close();
    });

    it('returns 409 generation_provider_unavailable when no provider endpoint can be resolved', async () => {
      await writeBuiltinProviderSettings();
      const providerRequests = mockProviderSuccess('Should not be called.');
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/character-field',
        payload: {
          field: 'name',
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'generation_provider_unavailable' });
      expect(providerRequests).toHaveLength(0);

      await app.close();
    });

    it('returns 400 validation_error for an unknown field', async () => {
      const providerRequests = mockProviderSuccess('Should not be called.');
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/character-field',
        payload: {
          field: 'backstory',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'validation_error' });
      expect(providerRequests).toHaveLength(0);

      await app.close();
    });
  });

  describe('POST /api/generation/character-avatar-prompt', () => {
    it('generates a Stable Diffusion portrait prompt from code-fenced provider JSON', async () => {
      const providerRequests = mockProviderSuccess(
        fenced({
          prompt: '1girl, silver hair, grey eyes, (masterpiece, best quality), soft lighting',
        }),
      );
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/character-avatar-prompt',
        payload: {
          card: {
            name: 'Лириэль',
            description: 'Высокая эльфийка с серебристыми волосами.',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = GenerateCharacterAvatarPromptResponseSchema.parse(response.json());
      expect(payload.prompt).toBe('1girl, silver hair, grey eyes, (masterpiece, best quality), soft lighting');

      expect(providerRequests).toHaveLength(1);
      const requestBody = getProviderRequestBody(providerRequests[0]);
      expect(requestBody).toMatchObject({
        max_tokens: 512,
        stream: false,
      });
      const systemMessage = requestBody.messages?.find((message) => message.role === 'system');
      expect(systemMessage?.content).toContain('Stable Diffusion');
      const userMessage = requestBody.messages?.at(-1);
      expect(userMessage?.content).toContain('Лириэль');

      await app.close();
    });

    it('returns 502 provider_generation_failed for unparseable provider output', async () => {
      mockProviderSuccess('Не могу сгенерировать промпт.');
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/character-avatar-prompt',
        payload: {
          card: {
            name: 'Лириэль',
          },
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });

      await app.close();
    });

    it('returns 409 generation_provider_unavailable when no provider endpoint can be resolved', async () => {
      await writeBuiltinProviderSettings();
      const providerRequests = mockProviderSuccess('Should not be called.');
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/character-avatar-prompt',
        payload: {
          card: {},
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'generation_provider_unavailable' });
      expect(providerRequests).toHaveLength(0);

      await app.close();
    });
  });

  describe('POST /api/generation/scenario', () => {
    it('generates a scenario draft and restores leaked player names to {{user}}', async () => {
      const providerRequests = mockProviderSuccess(
        fenced({
          name: 'Ночная мастерская',
          // Модель "проговорилась" именем игрока (Тестер, в косвенном падеже) — оно должно вернуться в {{user}}.
          content: 'Поздний вечер. {{char}} ждёт Тестера у входа в мастерскую.',
          firstMessage: '*{{char}} открывает дверь.* Заходи, Тестер, я уже заждалась.',
          tags: ['слайс-оф-лайф'],
        }),
      );
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/scenario',
        payload: {
          concept: 'Вечер в мастерской скульптора',
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = GenerateScenarioDraftResponseSchema.parse(response.json());
      expect(payload).toMatchObject({
        name: 'Ночная мастерская',
        content: 'Поздний вечер. {{char}} ждёт {{user}} у входа в мастерскую.',
        firstMessage: '*{{char}} открывает дверь.* Заходи, {{user}}, я уже заждалась.',
        tags: ['слайс-оф-лайф'],
      });

      expect(providerRequests).toHaveLength(1);
      const requestBody = getProviderRequestBody(providerRequests[0]);
      expect(requestBody).toMatchObject({
        max_tokens: 2048,
        stream: false,
      });
      const submittedContent = requestBody.messages?.map((message) => message.content).join('\n') ?? '';
      expect(submittedContent).toContain('Вечер в мастерской скульптора');
      // Fixture profile userName drives the gender hint.
      expect(submittedContent).toContain('Тестер');
      expect(submittedContent).toContain('{{user}} и {{char}}');

      await app.close();
    });

    it('keeps a caller-provided scenario name', async () => {
      mockProviderSuccess(
        fenced({
          name: 'Название от модели',
          content: '{{user}} и {{char}} встречаются на рынке.',
          tags: [],
        }),
      );
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/scenario',
        payload: {
          concept: 'Встреча на рынке',
          name: 'Моё название',
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = GenerateScenarioDraftResponseSchema.parse(response.json());
      expect(payload.name).toBe('Моё название');

      await app.close();
    });

    it('returns 502 provider_generation_failed for unparseable provider output', async () => {
      mockProviderSuccess('Сценарий: жили-были, без JSON.');
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/scenario',
        payload: {
          concept: 'Встреча на рынке',
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });

      await app.close();
    });

    it('returns 409 generation_provider_unavailable when no provider endpoint can be resolved', async () => {
      await writeBuiltinProviderSettings();
      const providerRequests = mockProviderSuccess('Should not be called.');
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/scenario',
        payload: {
          concept: 'Встреча на рынке',
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'generation_provider_unavailable' });
      expect(providerRequests).toHaveLength(0);

      await app.close();
    });
  });

  describe('POST /api/generation/scenario-first-message', () => {
    it('generates a scene greeting as plain text and restores leaked player names to {{user}}', async () => {
      const providerRequests = mockProviderSuccess(
        // Модель "проговорилась" именем игрока — оно должно вернуться в {{user}}.
        '\n*{{char}} машет рукой от мольберта.* Тестер, ты всё-таки пришёл!\n',
      );
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/scenario-first-message',
        payload: {
          concept: 'Вечер в мастерской скульптора',
          name: 'Ночная мастерская',
          content: 'Поздний вечер. {{char}} ждёт {{user}} у входа в мастерскую.',
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = GenerateScenarioFirstMessageResponseSchema.parse(response.json());
      expect(payload.value).toBe('*{{char}} машет рукой от мольберта.* {{user}}, ты всё-таки пришёл!');

      expect(providerRequests).toHaveLength(1);
      const requestBody = getProviderRequestBody(providerRequests[0]);
      expect(requestBody).toMatchObject({
        max_tokens: 512,
        stream: false,
        temperature: 0.44,
      });
      const submittedContent = requestBody.messages?.map((message) => message.content).join('\n') ?? '';
      expect(submittedContent).toContain('Вечер в мастерской скульптора');
      expect(submittedContent).toContain('Ночная мастерская');
      expect(submittedContent).toContain('{{char}} ждёт {{user}} у входа в мастерскую.');
      // Fixture profile userName drives the gender hint.
      expect(submittedContent).toContain('Тестер');

      await app.close();
    });

    it('returns 502 provider_generation_failed when the provider fails', async () => {
      const providerRequests = mockProviderFailure();
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/scenario-first-message',
        payload: {
          concept: 'Вечер в мастерской',
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });
      expect(providerRequests).toHaveLength(1);

      await app.close();
    });

    it('returns 502 provider_generation_failed for an empty provider message', async () => {
      mockProviderSuccess('   ');
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/scenario-first-message',
        payload: {
          concept: 'Вечер в мастерской',
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });

      await app.close();
    });

    it('returns 409 generation_provider_unavailable when no provider endpoint can be resolved', async () => {
      await writeBuiltinProviderSettings();
      const providerRequests = mockProviderSuccess('Should not be called.');
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/scenario-first-message',
        payload: {
          concept: 'Вечер в мастерской',
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'generation_provider_unavailable' });
      expect(providerRequests).toHaveLength(0);

      await app.close();
    });

    it('returns 400 validation_error without a concept and does not call the provider', async () => {
      const providerRequests = mockProviderSuccess('Should not be called.');
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/scenario-first-message',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'validation_error' });
      expect(providerRequests).toHaveLength(0);

      await app.close();
    });
  });

  describe('POST /api/generation/lorebook', () => {
    it('generates a lorebook draft and normalizes legacy singular "key" entries', async () => {
      const providerRequests = mockProviderSuccess(
        fenced({
          name: 'Мир Пепельных Земель',
          entries: [
            {
              keys: ['столица', 'Аштар'],
              comment: 'Столица',
              content: 'Аштар — столица Пепельных Земель, построенная на кратере.',
            },
            {
              key: 'орден',
              content: 'Орден Пепла охраняет кратер от мародёров.',
            },
          ],
        }),
      );
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/lorebook',
        payload: {
          concept: 'Постапокалиптические пустоши вокруг кратера',
          entryCount: 2,
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = GenerateLorebookDraftResponseSchema.parse(response.json());
      expect(payload.name).toBe('Мир Пепельных Земель');
      expect(payload.entries).toEqual([
        {
          comment: 'Столица',
          content: 'Аштар — столица Пепельных Земель, построенная на кратере.',
          keys: ['столица', 'Аштар'],
        },
        {
          content: 'Орден Пепла охраняет кратер от мародёров.',
          keys: ['орден'],
        },
      ]);

      expect(providerRequests).toHaveLength(1);
      const requestBody = getProviderRequestBody(providerRequests[0]);
      expect(requestBody).toMatchObject({
        max_tokens: 3000,
        stream: false,
      });
      const submittedContent = requestBody.messages?.map((message) => message.content).join('\n') ?? '';
      expect(submittedContent).toContain('Создай лорбук с 2 записями');
      expect(submittedContent).toContain('Постапокалиптические пустоши');

      await app.close();
    });

    it('returns 502 provider_generation_failed for unparseable provider output', async () => {
      mockProviderSuccess('Лорбук готов! Записи ниже. (шутка)');
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/lorebook',
        payload: {
          concept: 'Пустоши',
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });

      await app.close();
    });

    it('returns 502 provider_generation_failed when the JSON contains no usable entries', async () => {
      mockProviderSuccess(fenced({ name: 'Пустой мир', entries: [] }));
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/lorebook',
        payload: {
          concept: 'Пустоши',
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });

      await app.close();
    });

    it('returns 409 generation_provider_unavailable when no provider endpoint can be resolved', async () => {
      await writeBuiltinProviderSettings();
      const providerRequests = mockProviderSuccess('Should not be called.');
      const app = buildApiApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/lorebook',
        payload: {
          concept: 'Пустоши',
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'generation_provider_unavailable' });
      expect(providerRequests).toHaveLength(0);

      await app.close();
    });
  });
});
