import { SaveCharacterCommandSchema } from '@immersion/contracts/characters';
import {
  CharacterDraftFieldNameSchema,
  GenerateCharacterAvatarPromptResponseSchema,
  GenerateCharacterDraftResponseSchema,
  GenerateCharacterFieldResponseSchema,
  GenerateLorebookDraftResponseSchema,
  GenerateScenarioDraftResponseSchema,
  GenerateScenarioFirstMessageResponseSchema,
} from '@immersion/contracts/generation';
import { SaveScenarioCommandSchema } from '@immersion/contracts/scenarios';
import { beforeEach, describe, expect, it } from 'vitest';

import { readProviderChatRequest } from './test-support/provider-chat-request.js';
import type { ProviderChatRequestFixture } from './test-support/provider-chat-request-fixture-schema.js';
import { openAiChatCompletion, providerFailure } from './test-support/provider-responses.js';
import { useTestApi } from './test-support/use-test-api.js';

const PROVIDER_URL = 'http://127.0.0.1:6006';
const CHAT_COMPLETIONS_URL = `${PROVIDER_URL}/v1/chat/completions`;

describe('generation draft routes', () => {
  const api = useTestApi({ fixture: 'smoke' });

  beforeEach(async () => {
    await api().settings.useExternalProvider({ url: PROVIDER_URL });
  });

  function answerWith(content: string) {
    api().http.on('POST', CHAT_COMPLETIONS_URL, () => openAiChatCompletion(content));
  }

  function modelBoundPreset() {
    return api().settings.samplerPreset('smoke-model-preset');
  }

  function submittedText(request: ProviderChatRequestFixture) {
    return request.messages.map((message) => message.content).join('\n');
  }

  function fenced(json: object): string {
    return `Вот результат:\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\nГотово.`;
  }

  describe('POST /api/generation/character', () => {
    it('generates a character draft from code-fenced provider JSON with the model-bound preset in the profile language', async () => {
      answerWith(
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
      const response = await api().app.inject({
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

      expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
      expect(api().http.requests[0]?.headers.get('authorization')).toBe('Bearer secret-token');
      const requestBody = readProviderChatRequest(api().http);
      expect(requestBody).toMatchObject({
        max_tokens: 2048,
        stream: false,
        temperature: (await modelBoundPreset()).temperature,
      });
      const submittedContent = submittedText(requestBody);
      expect(submittedContent).toContain('Молодая скульпторша из Петербурга');
      expect(submittedContent).toContain('Пиши на русском.');
    });

    it('keeps caller-provided fields over generated values and mentions them in the prompt', async () => {
      answerWith(
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
      const response = await api().app.inject({
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

      const requestBody = readProviderChatRequest(api().http);
      const submittedContent = submittedText(requestBody);
      expect(submittedContent).toContain('Виктор Крамер');
    });

    it('returns 502 provider_generation_failed for unparseable provider output', async () => {
      answerWith('Просто текст без какого-либо JSON.');
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/character',
        payload: {
          concept: 'Детектив',
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });
    });

    it('names the token limit, not malformed JSON, when the draft is cut off where a {{user}} brace ends the text', async () => {
      api().http.on('POST', CHAT_COMPLETIONS_URL, () =>
        openAiChatCompletion('{"name": "Ария", "scenario": "{{char}} встречает {{user}} у печи, и', 'length'),
      );

      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/character',
        payload: {
          concept: 'Гончар из приморского города',
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({
        code: 'provider_generation_failed',
        message: expect.stringContaining('Ответ модели упёрся в лимит токенов'),
      });
    });

    it('returns 409 generation_provider_unavailable when no provider endpoint can be resolved', async () => {
      await api().settings.patch({ backendMode: 'builtin' });
      answerWith('Should not be called.');
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/character',
        payload: {
          concept: 'Детектив',
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'generation_provider_unavailable' });
      expect(api().http.requestLines()).toEqual([]);
    });

    it('returns 400 validation_error without a concept and does not call the provider', async () => {
      answerWith('Should not be called.');
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/character',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'validation_error' });
      expect(api().http.requestLines()).toEqual([]);
    });
  });

  describe('POST /api/generation/character-field', () => {
    it('generates a single field value as plain text', async () => {
      answerWith('\nВысокая женщина с серебристыми волосами.\n');
      const response = await api().app.inject({
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

      expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
      const requestBody = readProviderChatRequest(api().http);
      expect(requestBody).toMatchObject({
        max_tokens: 1024,
        stream: false,
        temperature: (await modelBoundPreset()).temperature,
      });
      const submittedContent = submittedText(requestBody);
      expect(submittedContent).toContain('Сгенерируй поле "description"');
      expect(submittedContent).toContain('Лириэль');
      expect(submittedContent).toContain('Эльфийка-архивариус');
    });

    it('raises the temperature and shows the model the previous value when regenerating an already filled field', async () => {
      answerWith('Совсем другой вариант описания.');
      const response = await api().app.inject({
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
      const requestBody = readProviderChatRequest(api().http);
      expect(requestBody.temperature).toBe(1.1);
      const submittedContent = submittedText(requestBody);
      expect(submittedContent).toContain('НОВЫЙ, ДРУГОЙ вариант');
      expect(submittedContent).toContain('не повторяй его');
      expect(submittedContent).toContain('Старое описание.');
    });

    it('embeds the previous value when regenerating fields outside the card summary block', async () => {
      answerWith('*Дверь распахивается.* Совсем новое вступление.');
      const response = await api().app.inject({
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
      const requestBody = readProviderChatRequest(api().http);
      const submittedContent = submittedText(requestBody);
      expect(submittedContent).toContain('Старая первая фраза, которую нельзя повторять.');
    });

    it.each(
      CharacterDraftFieldNameSchema.options,
    )('caps a generated %s exactly at the character save limit', async (field) => {
      answerWith(`Черта. ${'очень длинный текст '.repeat(1_300)}`);
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/character-field',
        payload: {
          field,
          current: {},
        },
      });

      expect(response.statusCode).toBe(200);
      const { value } = GenerateCharacterFieldResponseSchema.parse(response.json());
      expect(SaveCharacterCommandSchema.safeParse({ name: 'Имя', [field]: value }).success).toBe(true);
      expect(SaveCharacterCommandSchema.safeParse({ name: 'Имя', [field]: `${value}!` }).success).toBe(false);
    });

    it('returns 502 provider_generation_failed when the provider fails', async () => {
      api().http.on('POST', CHAT_COMPLETIONS_URL, () => providerFailure());
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/character-field',
        payload: {
          field: 'personality',
          current: {},
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });
      expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
    });

    it('returns 409 generation_provider_unavailable when no provider endpoint can be resolved', async () => {
      await api().settings.patch({ backendMode: 'builtin' });
      answerWith('Should not be called.');
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/character-field',
        payload: {
          field: 'name',
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'generation_provider_unavailable' });
      expect(api().http.requestLines()).toEqual([]);
    });

    it('returns 400 validation_error for an unknown field', async () => {
      answerWith('Should not be called.');
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/character-field',
        payload: {
          field: 'backstory',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'validation_error' });
      expect(api().http.requestLines()).toEqual([]);
    });
  });

  describe('POST /api/generation/character-avatar-prompt', () => {
    it('generates a Stable Diffusion portrait prompt from code-fenced provider JSON', async () => {
      answerWith(
        fenced({
          prompt: '1girl, silver hair, grey eyes, (masterpiece, best quality), soft lighting',
        }),
      );
      const response = await api().app.inject({
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

      expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
      const requestBody = readProviderChatRequest(api().http);
      expect(requestBody).toMatchObject({
        max_tokens: 512,
        stream: false,
      });
      const systemMessage = requestBody.messages.find((message) => message.role === 'system');
      expect(systemMessage?.content).toContain('Stable Diffusion');
      const userMessage = requestBody.messages.at(-1);
      expect(userMessage?.content).toContain('Лириэль');
    });

    it('asks for the prompt in English even when the profile answers in Russian', async () => {
      await api().settings.patch({ responseLanguage: 'ru' });
      answerWith(fenced({ prompt: '1girl, silver hair' }));
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/character-avatar-prompt',
        payload: {
          card: {
            name: 'Лириэль',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const requestBody = readProviderChatRequest(api().http);
      const submittedContent = submittedText(requestBody);
      expect(submittedContent).toContain('You are an expert at writing Stable Diffusion image generation prompts.');
      expect(submittedContent).toContain('Generate a Stable Diffusion portrait prompt for this character');
      expect(submittedContent).not.toContain('Пиши на русском.');
    });

    it('reads the prompt from the legacy "positive" key as well', async () => {
      answerWith(fenced({ positive: '1girl, silver hair, soft lighting' }));
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/character-avatar-prompt',
        payload: {
          card: {
            name: 'Лириэль',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = GenerateCharacterAvatarPromptResponseSchema.parse(response.json());
      expect(payload.prompt).toBe('1girl, silver hair, soft lighting');
    });

    it('returns 502 provider_generation_failed for unparseable provider output', async () => {
      answerWith('Не могу сгенерировать промпт.');
      const response = await api().app.inject({
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
    });

    it('returns 409 generation_provider_unavailable when no provider endpoint can be resolved', async () => {
      await api().settings.patch({ backendMode: 'builtin' });
      answerWith('Should not be called.');
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/character-avatar-prompt',
        payload: {
          card: {},
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'generation_provider_unavailable' });
      expect(api().http.requestLines()).toEqual([]);
    });
  });

  describe('POST /api/generation/scenario', () => {
    it('generates a scenario draft, naming the player for the gender hint and restoring leaked declined names to {{user}}', async () => {
      answerWith(
        fenced({
          name: 'Ночная мастерская',
          content: 'Поздний вечер. {{char}} ждёт Тестера у входа в мастерскую.',
          firstMessage: '*{{char}} открывает дверь.* Заходи, Тестер, я уже заждалась.',
          tags: ['слайс-оф-лайф'],
        }),
      );
      const response = await api().app.inject({
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

      expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
      const requestBody = readProviderChatRequest(api().http);
      expect(requestBody).toMatchObject({
        max_tokens: 2048,
        stream: false,
      });
      const submittedContent = submittedText(requestBody);
      expect(submittedContent).toContain('Вечер в мастерской скульптора');
      expect(submittedContent).toContain('Тестер');
      expect(submittedContent).toContain('{{user}} и {{char}}');
    });

    it('keeps a caller-provided scenario name', async () => {
      answerWith(
        fenced({
          name: 'Название от модели',
          content: '{{user}} и {{char}} встречаются на рынке.',
          tags: [],
        }),
      );
      const response = await api().app.inject({
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
    });

    it('returns 502 provider_generation_failed for unparseable provider output', async () => {
      answerWith('Сценарий: жили-были, без JSON.');
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/scenario',
        payload: {
          concept: 'Встреча на рынке',
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });
    });

    it('returns 409 generation_provider_unavailable when no provider endpoint can be resolved', async () => {
      await api().settings.patch({ backendMode: 'builtin' });
      answerWith('Should not be called.');
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/scenario',
        payload: {
          concept: 'Встреча на рынке',
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'generation_provider_unavailable' });
      expect(api().http.requestLines()).toEqual([]);
    });
  });

  describe('scenario prompts and the roles a concept assigns', () => {
    it.each([
      [
        'ru',
        'сохрани их в точности. НЕ меняй местами',
        'бери строго из концепции и текста сцены — не меняй их местами',
      ],
      ['en', 'preserve them exactly. Do NOT swap', 'strictly from the concept and scene text — do not swap them'],
    ])('tell the model in %s not to swap {{user}} and {{char}}', async (language, draftRule, greetingRule) => {
      await api().settings.patch({ responseLanguage: language });
      const concept = '{{char}} приходит на приём к {{user}}';

      api().http.once('POST', CHAT_COMPLETIONS_URL, () =>
        openAiChatCompletion(fenced({ name: 'Приём', content: '{{char}} входит.', tags: [] })),
      );
      api().http.once('POST', CHAT_COMPLETIONS_URL, () => openAiChatCompletion('*{{char}} стучит в дверь.*'));

      const draftResponse = await api().app.inject({
        method: 'POST',
        url: '/api/generation/scenario',
        payload: { concept },
      });
      const greetingResponse = await api().app.inject({
        method: 'POST',
        url: '/api/generation/scenario-first-message',
        payload: { concept },
      });

      expect(draftResponse.statusCode).toBe(200);
      expect(greetingResponse.statusCode).toBe(200);
      expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`, `POST ${CHAT_COMPLETIONS_URL}`]);
      expect(submittedText(readProviderChatRequest(api().http, 0))).toContain(draftRule);
      expect(submittedText(readProviderChatRequest(api().http, 1))).toContain(greetingRule);
    });
  });

  describe('POST /api/generation/scenario-first-message', () => {
    it('generates a scene greeting as plain text, naming the player for the gender hint and restoring leaked names to {{user}}', async () => {
      answerWith('\n*{{char}} машет рукой от мольберта.* Тестер, ты всё-таки пришёл!\n');
      const response = await api().app.inject({
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

      expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
      const requestBody = readProviderChatRequest(api().http);
      expect(requestBody).toMatchObject({
        max_tokens: 512,
        stream: false,
        temperature: (await modelBoundPreset()).temperature,
      });
      const submittedContent = submittedText(requestBody);
      expect(submittedContent).toContain('Вечер в мастерской скульптора');
      expect(submittedContent).toContain('Ночная мастерская');
      expect(submittedContent).toContain('{{char}} ждёт {{user}} у входа в мастерскую.');
      expect(submittedContent).toContain('Тестер');
    });

    it('caps a generated first message exactly at the scenario save limit', async () => {
      answerWith(`*{{char}} начинает рассказ.* ${'очень длинная история '.repeat(1_200)}`);
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/scenario-first-message',
        payload: {
          concept: 'Вечер в мастерской',
        },
      });

      expect(response.statusCode).toBe(200);
      const { value } = GenerateScenarioFirstMessageResponseSchema.parse(response.json());
      expect(SaveScenarioCommandSchema.safeParse({ firstMessage: value, name: 'Сцена' }).success).toBe(true);
      expect(SaveScenarioCommandSchema.safeParse({ firstMessage: `${value}!`, name: 'Сцена' }).success).toBe(false);
    });

    it('returns 502 provider_generation_failed when the provider fails', async () => {
      api().http.on('POST', CHAT_COMPLETIONS_URL, () => providerFailure());
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/scenario-first-message',
        payload: {
          concept: 'Вечер в мастерской',
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });
      expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
    });

    it('returns 502 provider_generation_failed for an empty provider message', async () => {
      answerWith('   ');
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/scenario-first-message',
        payload: {
          concept: 'Вечер в мастерской',
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });
    });

    it('returns 409 generation_provider_unavailable when no provider endpoint can be resolved', async () => {
      await api().settings.patch({ backendMode: 'builtin' });
      answerWith('Should not be called.');
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/scenario-first-message',
        payload: {
          concept: 'Вечер в мастерской',
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'generation_provider_unavailable' });
      expect(api().http.requestLines()).toEqual([]);
    });

    it('returns 400 validation_error without a concept and does not call the provider', async () => {
      answerWith('Should not be called.');
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/scenario-first-message',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'validation_error' });
      expect(api().http.requestLines()).toEqual([]);
    });
  });

  describe('POST /api/generation/lorebook', () => {
    it('generates a lorebook draft and normalizes legacy singular "key" entries', async () => {
      answerWith(
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
      const response = await api().app.inject({
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

      expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
      const requestBody = readProviderChatRequest(api().http);
      expect(requestBody).toMatchObject({
        max_tokens: 3000,
        stream: false,
      });
      const submittedContent = submittedText(requestBody);
      expect(submittedContent).toContain('Создай лорбук с 2 записями');
      expect(submittedContent).toContain('Постапокалиптические пустоши');
    });

    it('returns 502 provider_generation_failed for unparseable provider output', async () => {
      answerWith('Лорбук готов! Записи ниже. (шутка)');
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/lorebook',
        payload: {
          concept: 'Пустоши',
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });
    });

    it('returns 502 provider_generation_failed when the JSON contains no usable entries', async () => {
      answerWith(fenced({ name: 'Пустой мир', entries: [] }));
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/lorebook',
        payload: {
          concept: 'Пустоши',
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });
    });

    it('returns 409 generation_provider_unavailable when no provider endpoint can be resolved', async () => {
      await api().settings.patch({ backendMode: 'builtin' });
      answerWith('Should not be called.');
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/lorebook',
        payload: {
          concept: 'Пустоши',
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'generation_provider_unavailable' });
      expect(api().http.requestLines()).toEqual([]);
    });
  });

  it.each([
    ['/api/generation/chat-reply', { chatId: 'ceramics-chat', message: '   ' }],
    ['/api/generation/chat-title', { chatId: 42 }],
    ['/api/generation/first-message', {}],
    ['/api/generation/character', { concept: '   ' }],
    ['/api/generation/character-field', { field: 'backstory' }],
    ['/api/generation/character-avatar-prompt', { card: { name: 42 } }],
    ['/api/generation/scenario', { concept: 'Пустоши', name: '' }],
    ['/api/generation/scenario-first-message', { concept: 'x'.repeat(2_001) }],
    ['/api/generation/lorebook', { concept: 'Пустоши', entryCount: 21 }],
  ])('rejects an invalid draft command with 400 validation_error: %s', async (url, payload) => {
    answerWith('Should not be called.');

    const response = await api().app.inject({ method: 'POST', url, payload });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'validation_error', message: expect.any(String) });
    expect(api().http.requestLines()).toEqual([]);
  });
});
