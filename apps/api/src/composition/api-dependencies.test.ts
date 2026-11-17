import type { PathLike } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { type ApiConfig, parseApiConfig } from '../config/api-config.js';
import { type CharacterStore, createFileCharacterStore } from '../modules/characters/index.js';
import { FileChatRepository } from '../modules/chats/index.js';
import { InMemoryGenerationJobRegistry } from '../modules/generation/index.js';
import { type ChatIndex, InMemoryChatIndex } from '../modules/indexing/index.js';
import { createFileLorebookStore } from '../modules/lorebooks/index.js';
import { heuristicTokenCounter } from '../modules/prompting/index.js';
import type { VisionProbe } from '../modules/providers/index.js';
import { LlmProcessManager, ModelDirectoryScanner } from '../modules/runtime/index.js';
import { createFileScenarioStore } from '../modules/scenarios/index.js';
import { UserSettingsFile } from '../modules/settings/index.js';
import type { Clock } from '../platform/clock/clock.js';
import { systemClock } from '../platform/clock/system-clock.js';
import { createKeyedSerialQueue } from '../platform/concurrency/keyed-serial-queue.js';
import { globalHttpFetch } from '../platform/outbound-http/global-http-fetch.js';
import type { HttpFetch } from '../platform/outbound-http/http-fetch.js';
import { createCapturingLogger } from '../test-support/capturing-logger.js';
import { createDeferred } from '../test-support/deferred.js';
import { FakeChatCompletionClient } from '../test-support/fake-chat-completion-client.js';
import { FakeRuntimeProcess } from '../test-support/fake-runtime-process.js';
import { createHttpStub } from '../test-support/http-stub.js';
import { createInMemoryUserSettings } from '../test-support/in-memory-user-settings.js';
import { createManualClock } from '../test-support/manual-clock.js';
import { openAiChatCompletion } from '../test-support/provider-responses.js';
import { readStoredChatFile } from '../test-support/stored-chat-file.js';
import { createTemporaryProject } from '../test-support/temporary-project.js';
import { createTestApi } from '../test-support/test-api.js';
import { createApiDependencies } from './api-dependencies.js';
import { createApiModules } from './create-api-modules.js';

const projectRoot = path.join(os.tmpdir(), 'Проекты', 'Immersion AI');
const CONCURRENT_DISK_APPENDS_TIMEOUT_MS = 30_000;

async function claimConfig(): Promise<ApiConfig> {
  const project = await createTemporaryProject('empty');
  onTestFinished(() => project.remove());

  return parseApiConfig({ IMMERSION_DATA_ROOT: project.dataRoot, IMMERSION_LOG_LEVEL: 'silent' }, project.projectRoot);
}

function chatFilePath(config: ApiConfig, chatId: string): string {
  return path.join(config.dataRoot, 'chats', '_no_character_', `${chatId}.jsonl`);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value), 'utf8');
}

function holdReadsOf(filePath: string): { readonly entered: Promise<void>; release(): void } {
  const entered = createDeferred();
  const released = createDeferred();
  const realReadFile = fs.readFile;
  vi.spyOn(fs, 'readFile').mockImplementation((async (target: PathLike, options?: BufferEncoding) => {
    if (String(target) === filePath) {
      entered.resolve();
      await released.promise;
    }

    return realReadFile(target, options);
  }) as typeof fs.readFile);

  return { entered: entered.promise, release: () => released.resolve() };
}

describe('createApiDependencies', () => {
  it('honours overrides for every collaborator', () => {
    const clock: Clock = { now: () => new Date('2026-10-15T09:00:00.000Z') };
    const httpFetch = vi.fn<HttpFetch>();
    const { logger } = createCapturingLogger();
    const chatCompletionClient = new FakeChatCompletionClient();
    const chatRepository = new FileChatRepository({
      chatsDirectory: path.join(projectRoot, 'чаты'),
      logger,
      writeQueue: createKeyedSerialQueue(),
    });
    const chatIndex: ChatIndex = {
      getCharacterChatStats: () => Promise.resolve(new Map()),
      listChatSummaries: () => Promise.resolve([]),
    };
    const generationJobs = new InMemoryGenerationJobRegistry({ clock });
    const visionProbe: VisionProbe = { getVisionSupport: () => Promise.resolve('supported') };
    const characterStore = createFileCharacterStore({ directory: path.join(projectRoot, 'персонажи'), logger });
    const lorebookStore = createFileLorebookStore({ directory: path.join(projectRoot, 'миры') });
    const scenarioStore = createFileScenarioStore({ directory: path.join(projectRoot, 'сценарии') });
    const userSettings = createInMemoryUserSettings();
    const runtimeProcess = new FakeRuntimeProcess({ defaultModelsDir: path.join(projectRoot, 'models') });
    const modelScanner = new ModelDirectoryScanner({ clock });

    const dependencies = createApiDependencies(parseApiConfig({}, projectRoot), {
      characterStore,
      chatCompletionClient,
      chatIndex,
      chatRepository,
      clock,
      generationJobs,
      httpFetch,
      logger,
      lorebookStore,
      modelScanner,
      runtimeProcess,
      scenarioStore,
      tokenCounter: heuristicTokenCounter,
      userSettings,
      visionProbe,
    });

    expect(dependencies.clock).toBe(clock);
    expect(dependencies.httpFetch).toBe(httpFetch);
    expect(dependencies.logger).toBe(logger);
    expect(dependencies.chatCompletionClient).toBe(chatCompletionClient);
    expect(dependencies.chatRepository).toBe(chatRepository);
    expect(dependencies.chatIndex).toBe(chatIndex);
    expect(dependencies.generationJobs).toBe(generationJobs);
    expect(dependencies.tokenCounter).toBe(heuristicTokenCounter);
    expect(dependencies.visionProbe).toBe(visionProbe);
    expect(dependencies.characterStore).toBe(characterStore);
    expect(dependencies.lorebookStore).toBe(lorebookStore);
    expect(dependencies.scenarioStore).toBe(scenarioStore);
    expect(dependencies.userSettings).toBe(userSettings);
    expect(dependencies.runtimeProcess).toBe(runtimeProcess);
    expect(dependencies.modelScanner).toBe(modelScanner);
  });

  it('builds library stores, a chat repository, chat index, job registry, token counter and vision probe of its own for every app', () => {
    const config = parseApiConfig({}, projectRoot);
    const first = createApiDependencies(config);
    const second = createApiDependencies(config);

    expect(first.chatRepository).toBeInstanceOf(FileChatRepository);
    expect(second.chatRepository).not.toBe(first.chatRepository);
    expect(first.chatIndex).toBeInstanceOf(InMemoryChatIndex);
    expect(second.chatIndex).not.toBe(first.chatIndex);
    expect(second.generationJobs).not.toBe(first.generationJobs);
    expect(second.tokenCounter).not.toBe(first.tokenCounter);
    expect(second.visionProbe).not.toBe(first.visionProbe);
    expect(second.characterStore).not.toBe(first.characterStore);
    expect(second.lorebookStore).not.toBe(first.lorebookStore);
    expect(second.scenarioStore).not.toBe(first.scenarioStore);
    expect(first.runtimeProcess).toBeInstanceOf(LlmProcessManager);
    expect(second.runtimeProcess).not.toBe(first.runtimeProcess);
    expect(first.modelScanner).toBeInstanceOf(ModelDirectoryScanner);
    expect(second.modelScanner).not.toBe(first.modelScanner);
    expect(first.userSettings).toBeInstanceOf(UserSettingsFile);
    expect(second.userSettings).not.toBe(first.userSettings);
  });

  it('reads user settings from <dataRoot>/user-settings.json', async () => {
    const config = await claimConfig();
    await fs.writeFile(
      path.join(config.dataRoot, 'user-settings.json'),
      JSON.stringify({ userName: 'Тестер', backendMode: 'builtin' }),
      'utf8',
    );
    const dependencies = createApiDependencies(config, { logger: createCapturingLogger().logger });
    const modules = createApiModules(dependencies);

    expect(dependencies.userSettings.read()).toEqual({ backendMode: 'builtin', userName: 'Тестер' });
    expect(modules.settings.getProfileUserName()).toBe('Тестер');
    await expect(modules.providers.getProviderSettings()).resolves.toMatchObject({ mode: 'builtin' });
  });

  it('sends the settings, provider and runtime writes of one app through its one settings document', async () => {
    const userSettings = createInMemoryUserSettings({ userName: 'Тестер' });
    const { app } = await createTestApi({ overrides: { userSettings } });

    const responses = await Promise.all([
      app.inject({ method: 'PATCH', url: '/api/providers/settings', payload: { mode: 'builtin' } }),
      app.inject({ method: 'PUT', url: '/api/runtime/config', payload: { contextSize: 4096 } }),
      app.inject({
        method: 'PUT',
        url: '/api/settings/profile',
        payload: {
          messageFormatting: { actionsItalic: true, quotesHighlighted: false },
          responseLanguage: 'ru',
          streamingEnabled: true,
          systemPromptTemplate: '',
          thinkingEnabled: false,
          userName: 'Переименован',
          userPersona: '',
        },
      }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
    expect(userSettings.writes).toHaveLength(3);
    expect(userSettings.read()).toMatchObject({
      backendMode: 'builtin',
      llmServerConfig: { contextSize: 4096 },
      userName: 'Переименован',
    });
  });

  it("two apps with different data roots never see each other's settings", async () => {
    const firstConfig = await claimConfig();
    const secondConfig = await claimConfig();
    const logger = createCapturingLogger().logger;
    const firstDependencies = createApiDependencies(firstConfig, { logger });
    const first = createApiModules(firstDependencies);
    const second = createApiModules(createApiDependencies(secondConfig, { logger }));

    await firstDependencies.userSettings.update((current) => ({ ...current, userName: 'Первый' }));

    expect(first.settings.getProfileUserName()).toBe('Первый');
    expect(second.settings.getProfileUserName()).toBe('User');
    await expect(fs.stat(path.join(secondConfig.dataRoot, 'user-settings.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('looks for llama-server under the configured project root and reads its PID file from the configured data root', async () => {
    const config = await claimConfig();
    await fs.mkdir(path.join(config.projectRoot, 'bin'), { recursive: true });
    await fs.writeFile(path.join(config.projectRoot, 'bin', 'llama-server'), '');
    await fs.writeFile(
      path.join(config.dataRoot, '.llm-server.json'),
      JSON.stringify({ model: 'model.gguf', modelPath: 'model.gguf', pid: 2_147_483_646, port: 5001 }),
    );
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
    });
    const { runtimeProcess } = createApiDependencies(config, { logger: createCapturingLogger().logger });

    expect(runtimeProcess.getEngineInfo()).toEqual({
      defaultModelsDir: path.join(config.projectRoot, 'models'),
      executablePath: path.join(config.projectRoot, 'bin', 'llama-server'),
      found: true,
    });
    expect(runtimeProcess.getState()).toMatchObject({ status: 'idle', pid: null });
    await expect(fs.stat(path.join(config.dataRoot, '.llm-server.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('resolves the generation provider from the overridden settings document', async () => {
    const userSettings = createInMemoryUserSettings({
      activeProvider: 'custom',
      backendMode: 'external',
      providerConfigs: { custom: { model: 'qwen3-8b', url: 'http://127.0.0.1:6001' } },
    });
    const modules = createApiModules(createApiDependencies(parseApiConfig({}, projectRoot), { userSettings }));

    await expect(modules.providers.resolveGenerationProviderEndpoint()).resolves.toMatchObject({
      baseUrl: 'http://127.0.0.1:6001',
      model: 'qwen3-8b',
    });
  });

  it('builds the vision probe on the overridden HttpFetch and clock', async () => {
    const http = createHttpStub();
    http.on('GET', 'http://127.0.0.1:6008/props', () => Response.json({ modalities: { vision: true } }));
    const clock = createManualClock();
    const dependencies = createApiDependencies(parseApiConfig({}, projectRoot), { clock, httpFetch: http.fetch });

    await expect(
      dependencies.visionProbe.getVisionSupport({ baseUrl: 'http://127.0.0.1:6008', model: null }),
    ).resolves.toBe('supported');
    clock.advance(60_001);
    await dependencies.visionProbe.getVisionSupport({ baseUrl: 'http://127.0.0.1:6008', model: null });

    expect(http.requestLines()).toEqual(['GET http://127.0.0.1:6008/props', 'GET http://127.0.0.1:6008/props']);
  });

  it('stamps generation jobs from the overridden clock', () => {
    const clock: Clock = { now: () => new Date('2026-10-15T09:00:00.000Z') };
    const dependencies = createApiDependencies(parseApiConfig({}, projectRoot), { clock });

    const job = dependencies.generationJobs.createChatReplyJob({
      chatId: 'chat-1',
      command: { chatId: 'chat-1', message: 'Привет.', mode: 'reply' },
    });

    expect(job.createdAt).toBe('2026-10-15T09:00:00.000Z');
  });

  it('builds the chat completion client on the overridden HttpFetch', async () => {
    const http = createHttpStub();
    http.on('POST', 'http://127.0.0.1:6007/v1/chat/completions', () => openAiChatCompletion('Привет.'));
    const dependencies = createApiDependencies(parseApiConfig({}, projectRoot), { httpFetch: http.fetch });

    const completion = await dependencies.chatCompletionClient.completeChat({
      endpoint: {
        apiKey: null,
        apiKind: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:6007',
        contextSize: null,
        model: 'm',
      },
      maxTokens: 8,
      messages: [{ content: 'Скажи привет.', role: 'user' }],
      sampling: {
        minP: 0,
        presencePenalty: 0,
        repeatPenalty: 1,
        repeatPenaltyRange: 0,
        temperature: 0,
        topK: 0,
        topP: 1,
      },
    });

    expect(completion.content).toBe('Привет.');
    expect(http.requestLines()).toEqual(['POST http://127.0.0.1:6007/v1/chat/completions']);
  });

  it('falls back to the system clock and the global fetch', () => {
    const dependencies = createApiDependencies(parseApiConfig({}, projectRoot));

    expect(dependencies.clock).toBe(systemClock);
    expect(dependencies.httpFetch).toBe(globalHttpFetch);
  });

  it('creates the logger at the configured level', () => {
    for (const level of ['silent', 'warn', 'trace'] as const) {
      const config = parseApiConfig({ IMMERSION_LOG_LEVEL: level }, projectRoot);

      expect(createApiDependencies(config).logger.level).toBe(level);
    }
  });

  it('places chats under <dataRoot>/chats/_no_character_', async () => {
    const config = await claimConfig();
    await fs.mkdir(path.dirname(chatFilePath(config, 'stored-before')), { recursive: true });
    await fs.writeFile(
      chatFilePath(config, 'stored-before'),
      `${JSON.stringify({ chat_metadata: { createdAt: '2026-10-01T00:00:00.000Z', title: 'Сохранённый', updatedAt: '2026-10-01T00:00:00.000Z' } })}\n`,
      'utf8',
    );
    const dependencies = createApiDependencies(config);

    await dependencies.chatRepository.createGenericChat({
      createdAt: '2026-10-02T00:00:00.000Z',
      id: 'created-now',
      title: 'Новый',
      userName: 'Тестер',
    });

    await expect(readStoredChatFile(chatFilePath(config, 'created-now'))).resolves.toMatchObject({
      header: { chat_metadata: { title: 'Новый' } },
    });
    expect((await dependencies.chatIndex.listChatSummaries()).map((summary) => summary.title)).toEqual([
      'Новый',
      'Сохранённый',
    ]);
  });

  it('places characters, lorebooks and scenarios under the configured data root', async () => {
    const config = await claimConfig();
    await writeJson(path.join(config.dataRoot, 'characters', 'Ирис.json'), { name: 'Ирис' });
    await writeJson(path.join(config.dataRoot, 'worlds', 'Мир.json'), { entries: [], name: 'Мир' });
    await writeJson(path.join(config.dataRoot, 'scenarios', 'Порт.json'), { content: 'Порт.', name: 'Порт' });
    const dependencies = createApiDependencies(config, { logger: createCapturingLogger().logger });

    expect((await dependencies.characterStore.listCharacters()).map((item) => item.id)).toEqual(['Ирис.json']);
    expect((await dependencies.lorebookStore.listLorebooks()).map((item) => item.id)).toEqual(['Мир.json']);
    expect((await dependencies.scenarioStore.listScenarios()).map((item) => item.id)).toEqual(['Порт.json']);
  });

  it('two apps with different data roots list different characters', async () => {
    const firstConfig = await claimConfig();
    const secondConfig = await claimConfig();
    await writeJson(path.join(firstConfig.dataRoot, 'characters', 'Первый.json'), { name: 'Первый' });
    await writeJson(path.join(secondConfig.dataRoot, 'characters', 'Второй.json'), { name: 'Второй' });
    const logger = createCapturingLogger().logger;
    const first: CharacterStore = createApiDependencies(firstConfig, { logger }).characterStore;
    const second: CharacterStore = createApiDependencies(secondConfig, { logger }).characterStore;

    expect((await first.listCharacters()).map((item) => item.name)).toEqual(['Первый']);
    expect((await second.listCharacters()).map((item) => item.name)).toEqual(['Второй']);
  });

  it('two apps on different data roots keep separate chat indexes and write queues', async () => {
    const firstConfig = await claimConfig();
    const secondConfig = await claimConfig();
    const first = createApiDependencies(firstConfig);
    const second = createApiDependencies(secondConfig);
    for (const dependencies of [first, second]) {
      await dependencies.chatRepository.createGenericChat({
        createdAt: '2026-10-01T00:00:00.000Z',
        id: 'same-chat',
        title: 'Один id на двоих',
        userName: 'Тестер',
      });
    }
    await first.chatRepository.appendGenericChatMessages('same-chat', [
      { content: 'Только в первом', createdAt: '2026-10-01T00:00:01.000Z', role: 'user' },
    ]);

    expect((await first.chatIndex.listChatSummaries()).map((summary) => summary.messageCount)).toEqual([1]);
    expect((await second.chatIndex.listChatSummaries()).map((summary) => summary.messageCount)).toEqual([0]);

    const firstWrite = holdReadsOf(chatFilePath(firstConfig, 'same-chat'));
    const heldAppend = first.chatRepository.appendGenericChatMessages('same-chat', [
      { content: 'Ждёт', createdAt: '2026-10-01T00:00:02.000Z', role: 'user' },
    ]);
    await firstWrite.entered;

    const secondSession = await second.chatRepository.appendGenericChatMessages('same-chat', [
      { content: 'Не ждёт', createdAt: '2026-10-01T00:00:02.000Z', role: 'user' },
    ]);
    firstWrite.release();
    const firstSession = await heldAppend;

    expect(secondSession?.messages.map((message) => message.content)).toEqual(['Не ждёт']);
    expect(firstSession?.messages.map((message) => message.content)).toEqual(['Только в первом', 'Ждёт']);
  });

  it(
    'concurrent appends to one chat through one app are serialized',
    async () => {
      const config = await claimConfig();
      const dependencies = createApiDependencies(config, {
        clock: createManualClock(),
        logger: createCapturingLogger().logger,
      });
      const modules = createApiModules(dependencies);
      const chat = await dependencies.chatRepository.createGenericChat({
        createdAt: '2026-10-01T00:00:00.000Z',
        id: 'busy-chat',
        title: 'Очередь',
        userName: 'Тестер',
      });
      const contents = Array.from({ length: 12 }, (_, index) => `реплика ${index.toString().padStart(2, '0')}`);

      await Promise.all(
        contents.map((content, index) =>
          modules.chats.appendChatMessages(chat.id, [
            { content, createdAt: `2026-10-01T00:00:${(index + 1).toString().padStart(2, '0')}.000Z`, role: 'user' },
          ]),
        ),
      );

      const stored = await readStoredChatFile(chatFilePath(config, 'busy-chat'));
      expect(stored.messages.map((message) => message.mes)).toEqual(contents);
    },
    CONCURRENT_DISK_APPENDS_TIMEOUT_MS,
  );
});
