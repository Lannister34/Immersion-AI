import type { GenerationJobDto } from '@immersion/contracts/generation';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { describe, expect, it } from 'vitest';

import { FakeChatCompletionClient } from '../../../test-support/fake-chat-completion-client.js';
import { InMemoryChatSessions } from '../../../test-support/in-memory-chat-sessions.js';
import { createManualClock } from '../../../test-support/manual-clock.js';
import { createPromptingModule, heuristicTokenCounter } from '../../prompting/index.js';
import { InMemoryGenerationJobRegistry } from '../infrastructure/in-memory-generation-job-registry.js';
import type { ChatCompletionClient, ChatCompletionEndpoint } from './chat-completion-client.js';
import { ProviderGenerationError } from './generation-errors.js';
import type { GenerationJobRegistry } from './generation-job-registry.js';
import {
  type StartChatReplyGenerationJobDependencies,
  startChatReplyGenerationJob,
} from './start-chat-reply-generation-job.js';

const CHAT_ID = 'chat-in-memory';

const CONFIGURED_ENDPOINT: ChatCompletionEndpoint = {
  apiKey: null,
  apiKind: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:6007',
  contextSize: null,
  model: 'настроенная-модель',
};

const SETTINGS: SettingsOverviewResponse = {
  profile: {
    messageFormatting: { actionsItalic: true, quotesHighlighted: false },
    responseLanguage: 'ru',
    streamingEnabled: false,
    systemPromptTemplate: '',
    thinkingEnabled: true,
    userName: 'Алексей',
    userPersona: '',
  },
  sampler: {
    activePresetId: 'active',
    modelBindingCount: 0,
    modelBindings: [],
    presets: [
      {
        contextTrimStrategy: 'trim_middle',
        id: 'active',
        maxContextLength: 8192,
        maxTokens: 600,
        minP: 0.02,
        name: 'Active',
        presencePenalty: 0,
        repeatPenalty: 1.05,
        repeatPenaltyRange: 2048,
        temperature: 0.65,
        topK: 0,
        topP: 1,
      },
    ],
  },
};

interface InMemoryPorts {
  readonly chats: InMemoryChatSessions;
  readonly dependencies: StartChatReplyGenerationJobDependencies;
}

function createInMemoryPorts(chatCompletionClient: ChatCompletionClient): InMemoryPorts {
  const clock = createManualClock({ start: new Date('2026-04-01T12:00:00.000Z'), stepMs: 0 });
  const chats = new InMemoryChatSessions();
  chats.create(CHAT_ID, '2026-04-01T11:00:00.000Z');
  const settings = { getSettingsOverview: () => SETTINGS };

  return {
    chats,
    dependencies: {
      chatCompletionClient,
      chats,
      clock,
      generationJobs: new InMemoryGenerationJobRegistry({ clock }),
      prompting: createPromptingModule({
        characters: { findCharacter: () => Promise.resolve(null) },
        lorebooks: { findLorebook: () => Promise.resolve(null) },
        scenarios: { findScenario: () => Promise.resolve(null) },
        settings,
      }),
      providers: { resolveGenerationProviderEndpoint: () => Promise.resolve(CONFIGURED_ENDPOINT) },
      settings,
      tokenCounter: heuristicTokenCounter,
    },
  };
}

function settledJob(registry: GenerationJobRegistry, jobId: string): Promise<GenerationJobDto> {
  return new Promise((resolve) => {
    const unsubscribe = registry.subscribe(jobId, (event) => {
      if (event.type === 'generation.job.updated' && event.job.completedAt !== null) {
        unsubscribe();
        resolve(event.job);
      }
    });
  });
}

describe('startChatReplyGenerationJob', () => {
  it('appends the reply and completes the job', async () => {
    const client = new FakeChatCompletionClient().reply({
      content: 'Добрый вечер, Алексей.',
      reasoning: 'Поздороваться.',
    });
    const { chats, dependencies } = createInMemoryPorts(client);

    const started = await startChatReplyGenerationJob(
      { chatId: CHAT_ID, message: 'Добрый вечер.', mode: 'reply' },
      dependencies,
    );
    const job = await settledJob(dependencies.generationJobs, started.job.id);

    expect(started.job.status).toBe('queued');
    expect(started.session.messages.map(({ content, role }) => ({ content, role }))).toEqual([
      { content: 'Добрый вечер.', role: 'user' },
    ]);
    expect(job).toMatchObject({ error: null, id: started.job.id, status: 'completed' });
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0]).toMatchObject({
      endpoint: CONFIGURED_ENDPOINT,
      maxTokens: 600,
      messages: [{ content: 'Добрый вечер.', role: 'user' }],
    });
    expect((await chats.getChatSession(CHAT_ID))?.messages).toEqual([
      expect.objectContaining({ content: 'Добрый вечер.', createdAt: '2026-04-01T12:00:00.000Z', role: 'user' }),
      expect.objectContaining({ content: 'Добрый вечер, Алексей.', reasoning: 'Поздороваться.', role: 'assistant' }),
    ]);
  });

  it('marks the job failed with provider_generation_failed', async () => {
    const failingClient: ChatCompletionClient = {
      completeChat: () => Promise.reject(new ProviderGenerationError('Провайдер ответил 500.')),
    };
    const { chats, dependencies } = createInMemoryPorts(failingClient);

    const started = await startChatReplyGenerationJob(
      { chatId: CHAT_ID, message: 'Ты здесь?', mode: 'reply' },
      dependencies,
    );
    const job = await settledJob(dependencies.generationJobs, started.job.id);

    expect(job).toMatchObject({
      error: { code: 'provider_generation_failed', message: 'Провайдер ответил 500.' },
      status: 'failed',
    });
    expect((await chats.getChatSession(CHAT_ID))?.messages.map(({ content, role }) => ({ content, role }))).toEqual([
      { content: 'Ты здесь?', role: 'user' },
    ]);
  });
});
