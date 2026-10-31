import type { PathLike } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { type ApiConfig, parseApiConfig } from '../config/api-config.js';
import { FileChatRepository } from '../modules/chats/index.js';
import { InMemoryGenerationJobRegistry } from '../modules/generation/index.js';
import { type ChatIndex, InMemoryChatIndex } from '../modules/indexing/index.js';
import { heuristicTokenCounter } from '../modules/prompting/index.js';
import type { VisionProbe } from '../modules/providers/index.js';
import type { Clock } from '../platform/clock/clock.js';
import { systemClock } from '../platform/clock/system-clock.js';
import { createKeyedSerialQueue } from '../platform/concurrency/keyed-serial-queue.js';
import { globalHttpFetch } from '../platform/outbound-http/global-http-fetch.js';
import type { HttpFetch } from '../platform/outbound-http/http-fetch.js';
import { createCapturingLogger } from '../test-support/capturing-logger.js';
import { createDeferred } from '../test-support/deferred.js';
import { FakeChatCompletionClient } from '../test-support/fake-chat-completion-client.js';
import { createHttpStub } from '../test-support/http-stub.js';
import { createManualClock } from '../test-support/manual-clock.js';
import { openAiChatCompletion } from '../test-support/provider-responses.js';
import { readStoredChatFile } from '../test-support/stored-chat-file.js';
import { createTemporaryProject } from '../test-support/temporary-project.js';
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

    const dependencies = createApiDependencies(parseApiConfig({}, projectRoot), {
      chatCompletionClient,
      chatIndex,
      chatRepository,
      clock,
      generationJobs,
      httpFetch,
      logger,
      tokenCounter: heuristicTokenCounter,
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
  });

  it('builds a chat repository, chat index, job registry, token counter and vision probe of its own for every app', () => {
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
