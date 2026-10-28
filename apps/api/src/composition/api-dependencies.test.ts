import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { parseApiConfig } from '../config/api-config.js';
import { FileChatRepository } from '../modules/chats/index.js';
import { InMemoryGenerationJobRegistry } from '../modules/generation/index.js';
import { heuristicTokenCounter } from '../modules/prompting/index.js';
import type { VisionProbe } from '../modules/providers/index.js';
import type { Clock } from '../platform/clock/clock.js';
import { systemClock } from '../platform/clock/system-clock.js';
import { globalHttpFetch } from '../platform/outbound-http/global-http-fetch.js';
import type { HttpFetch } from '../platform/outbound-http/http-fetch.js';
import { createCapturingLogger } from '../test-support/capturing-logger.js';
import { FakeChatCompletionClient } from '../test-support/fake-chat-completion-client.js';
import { createHttpStub } from '../test-support/http-stub.js';
import { createManualClock } from '../test-support/manual-clock.js';
import { openAiChatCompletion } from '../test-support/provider-responses.js';
import { createApiDependencies } from './api-dependencies.js';

const projectRoot = path.join(os.tmpdir(), 'Проекты', 'Immersion AI');

describe('createApiDependencies', () => {
  it('honours overrides for every collaborator', () => {
    const clock: Clock = { now: () => new Date('2026-10-15T09:00:00.000Z') };
    const httpFetch = vi.fn<HttpFetch>();
    const { logger } = createCapturingLogger();
    const chatCompletionClient = new FakeChatCompletionClient();
    const chatRepository = new FileChatRepository();
    const generationJobs = new InMemoryGenerationJobRegistry({ clock });
    const visionProbe: VisionProbe = { getVisionSupport: () => Promise.resolve('supported') };

    const dependencies = createApiDependencies(parseApiConfig({}, projectRoot), {
      chatCompletionClient,
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
    expect(dependencies.generationJobs).toBe(generationJobs);
    expect(dependencies.tokenCounter).toBe(heuristicTokenCounter);
    expect(dependencies.visionProbe).toBe(visionProbe);
  });

  it('builds a chat repository, job registry, token counter and vision probe of its own for every app', () => {
    const config = parseApiConfig({}, projectRoot);
    const first = createApiDependencies(config);
    const second = createApiDependencies(config);

    expect(first.chatRepository).toBeInstanceOf(FileChatRepository);
    expect(second.chatRepository).not.toBe(first.chatRepository);
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
      endpoint: { apiKey: null, apiKind: 'openai-compatible', baseUrl: 'http://127.0.0.1:6007', model: 'm' },
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
});
