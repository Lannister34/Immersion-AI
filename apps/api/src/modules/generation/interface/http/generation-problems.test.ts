import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { GenerationJobDto } from '@immersion/contracts/generation';
import { describe, expect, it } from 'vitest';

import {
  ChatNotEmptyError,
  ChatReplyGenerationFailedError,
  ChatTranscriptEmptyError,
  GenerationJobNotFoundError,
  NoAssistantMessageToRegenerateError,
  NothingToAnswerError,
  NothingToContinueError,
  ProviderGenerationError,
  ProviderReplyTruncatedError,
} from '../../application/generation-errors.js';
import { ActiveGenerationJobExistsError } from '../../application/generation-job-registry.js';
import { generationProblems } from './generation-problems.js';

const CHAT_ID = 'ceramics-chat';

const ACTIVE_JOB: GenerationJobDto = {
  chatId: CHAT_ID,
  completedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  error: null,
  id: '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60',
  kind: 'chat_reply',
  startedAt: '2026-01-01T00:00:01.000Z',
  status: 'running',
  updatedAt: '2026-01-01T00:00:01.000Z',
};

const SESSION: ChatSessionDto = {
  characterAvatarUrl: null,
  characterId: null,
  characterName: null,
  chat: {
    characterAvatarUrl: null,
    characterId: null,
    characterName: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    id: CHAT_ID,
    lastMessagePreview: 'Расскажи про обжиг керамики.',
    lorebookIds: [],
    messageCount: 1,
    scenarioId: null,
    scenarioName: null,
    title: 'Обжиг',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  generationSettings: {
    additionalInstructions: null,
    samplerPresetId: null,
    sampling: {
      contextTrimStrategy: null,
      maxContextLength: null,
      maxTokens: null,
      minP: null,
      presencePenalty: null,
      repeatPenalty: null,
      repeatPenaltyRange: null,
      temperature: null,
      topK: null,
      topP: null,
    },
    systemPrompt: null,
  },
  lorebookIds: [],
  messages: [
    {
      attachments: [],
      content: 'Расскажи про обжиг керамики.',
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'message-1',
      reasoning: null,
      role: 'user',
    },
  ],
  scenarioId: null,
  scenarioName: null,
  userName: 'Миша',
};

describe('generationProblems', () => {
  it('answers each transcript refusal with 409 and its own code and text', () => {
    expect(generationProblems.map(new NoAssistantMessageToRegenerateError(CHAT_ID))).toEqual({
      statusCode: 409,
      body: {
        code: 'no_assistant_message_to_regenerate',
        message: 'Перегенерировать нечего: чат не заканчивается ответом персонажа на сообщение пользователя.',
      },
    });
    expect(generationProblems.map(new NothingToAnswerError(CHAT_ID))).toEqual({
      statusCode: 409,
      body: {
        code: 'nothing_to_answer',
        message: 'Отвечать не на что: последним в чате должно быть непустое сообщение пользователя.',
      },
    });
    expect(generationProblems.map(new NothingToContinueError(CHAT_ID))).toEqual({
      statusCode: 409,
      body: {
        code: 'nothing_to_continue',
        message: 'Продолжать нечего: последнее сообщение в чате должно быть непустым ответом персонажа.',
      },
    });
    expect(generationProblems.map(new ChatTranscriptEmptyError(CHAT_ID))).toEqual({
      statusCode: 409,
      body: { code: 'chat_empty', message: 'Chat has no messages to derive a title from.' },
    });
    expect(generationProblems.map(new ChatNotEmptyError(CHAT_ID))).toEqual({
      statusCode: 409,
      body: {
        code: 'chat_not_empty',
        message: 'Chat already has messages; a first message can only be generated for an empty chat.',
      },
    });
  });

  it('answers an active job with 409 and that job beside the code and text', () => {
    expect(generationProblems.map(new ActiveGenerationJobExistsError(CHAT_ID, ACTIVE_JOB))).toEqual({
      statusCode: 409,
      body: {
        code: 'active_generation_job_exists',
        job: ACTIVE_JOB,
        message: 'An active generation job already exists for this chat.',
      },
    });
  });

  it('answers a failed chat reply with the status it carries and the session the user message was kept in', () => {
    const error = new ChatReplyGenerationFailedError(
      409,
      'chat_changed_during_generation',
      'Чат изменился во время генерации — продолжение не было сохранено.',
      SESSION,
    );

    expect(generationProblems.map(error)).toEqual({
      statusCode: 409,
      body: {
        code: 'chat_changed_during_generation',
        message: 'Чат изменился во время генерации — продолжение не было сохранено.',
        session: SESSION,
      },
    });
  });

  it('answers a provider failure with 502 provider_generation_failed and its message', () => {
    expect(generationProblems.map(new ProviderGenerationError('Provider returned malformed JSON output.'))).toEqual({
      statusCode: 502,
      body: { code: 'provider_generation_failed', message: 'Provider returned malformed JSON output.' },
    });
  });

  it('answers a reply cut off at the token limit as a provider failure that names the limit', () => {
    expect(generationProblems.map(new ProviderReplyTruncatedError())).toEqual({
      statusCode: 502,
      body: {
        code: 'provider_generation_failed',
        message: 'Ответ модели упёрся в лимит токенов и оборвался. Попробуйте ещё раз.',
      },
    });
  });

  it('answers an unknown job with 404 generation_job_not_found without echoing the id', () => {
    expect(generationProblems.map(new GenerationJobNotFoundError(ACTIVE_JOB.id))).toEqual({
      statusCode: 404,
      body: { code: 'generation_job_not_found', message: 'Generation job not found.' },
    });
  });

  it('leaves an error whose message only looks like a generation one to the unexpected-error path', () => {
    expect(generationProblems.map(new Error('Generation job not found.'))).toBeNull();
    expect(generationProblems.map(new Error('An active generation job already exists for this chat.'))).toBeNull();
  });
});
