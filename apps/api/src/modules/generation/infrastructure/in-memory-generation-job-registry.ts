import { randomUUID } from 'node:crypto';
import type { ChatSessionDto } from '@immersion/contracts/chats';
import { ApiProblemSchema } from '@immersion/contracts/common';
import type {
  GenerationJobDto,
  GenerationJobEvent,
  GenerationJobId,
  GenerationJobStatus,
} from '@immersion/contracts/generation';
import { ChatReplyGenerationFailedError, ProviderGenerationError } from '../application/generation-errors.js';
import {
  ActiveGenerationJobExistsError,
  type ChatReplyGenerationJobRunnerInput,
  type CreateChatReplyGenerationJobInput,
  type GenerationJobEventSubscriber,
  type GenerationJobRegistry,
} from '../application/generation-job-registry.js';

interface StoredGenerationJob {
  controller: AbortController;
  dto: GenerationJobDto;
}

export interface InMemoryGenerationJobRegistryOptions {
  finishedJobTtlMs?: number;
}

const DEFAULT_FINISHED_JOB_TTL_MS = 5 * 60 * 1000;

function isActiveStatus(status: GenerationJobStatus) {
  return status === 'queued' || status === 'running';
}

function isAbortError(error: unknown) {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

function cloneJob(job: GenerationJobDto): GenerationJobDto {
  return {
    ...job,
    error: job.error ? { ...job.error } : null,
  };
}

function toProblem(error: unknown) {
  if (error instanceof ChatReplyGenerationFailedError) {
    return ApiProblemSchema.parse({
      code: error.code,
      message: error.message,
    });
  }

  if (error instanceof ProviderGenerationError) {
    return ApiProblemSchema.parse({
      code: 'provider_generation_failed',
      message: error.message,
    });
  }

  if (error instanceof Error) {
    return ApiProblemSchema.parse({
      code: 'generation_failed',
      message: error.message,
    });
  }

  return ApiProblemSchema.parse({
    code: 'generation_failed',
    message: 'Generation failed.',
  });
}

export class InMemoryGenerationJobRegistry implements GenerationJobRegistry {
  private readonly jobs = new Map<GenerationJobId, StoredGenerationJob>();
  private readonly subscribers = new Map<GenerationJobId, Set<GenerationJobEventSubscriber>>();
  private readonly evictionTimers = new Map<GenerationJobId, ReturnType<typeof setTimeout>>();
  private readonly finishedJobTtlMs: number;

  constructor(options: InMemoryGenerationJobRegistryOptions = {}) {
    this.finishedJobTtlMs = options.finishedJobTtlMs ?? DEFAULT_FINISHED_JOB_TTL_MS;
  }

  cancel(jobId: GenerationJobId) {
    const storedJob = this.jobs.get(jobId);

    if (!storedJob) {
      return null;
    }

    if (!isActiveStatus(storedJob.dto.status)) {
      return cloneJob(storedJob.dto);
    }

    storedJob.controller.abort();
    const canceledJob = this.updateJob(jobId, {
      completedAt: new Date().toISOString(),
      error: null,
      status: 'canceled',
    });

    this.emit({
      job: canceledJob,
      type: 'generation.job.updated',
    });

    return canceledJob;
  }

  createChatReplyJob(input: CreateChatReplyGenerationJobInput) {
    const activeJob = this.findActiveChatReplyJob(input.chatId);

    if (activeJob) {
      throw new ActiveGenerationJobExistsError(input.chatId, activeJob);
    }

    const now = new Date().toISOString();
    const job: GenerationJobDto = {
      chatId: input.chatId,
      completedAt: null,
      createdAt: now,
      error: null,
      id: randomUUID(),
      kind: 'chat_reply',
      startedAt: null,
      status: 'queued',
      updatedAt: now,
    };

    this.jobs.set(job.id, {
      controller: new AbortController(),
      dto: job,
    });

    return cloneJob(job);
  }

  fail(jobId: GenerationJobId, error: unknown) {
    const storedJob = this.jobs.get(jobId);

    if (!storedJob) {
      return null;
    }

    if (!isActiveStatus(storedJob.dto.status)) {
      return cloneJob(storedJob.dto);
    }

    const failedJob = this.updateJob(jobId, {
      completedAt: new Date().toISOString(),
      error: toProblem(error),
      status: 'failed',
    });

    this.emit({
      job: failedJob,
      type: 'generation.job.updated',
    });

    return failedJob;
  }

  get(jobId: GenerationJobId) {
    const storedJob = this.jobs.get(jobId);

    return storedJob ? cloneJob(storedJob.dto) : null;
  }

  list(input: { chatId?: string } = {}) {
    return [...this.jobs.values()]
      .map((storedJob) => storedJob.dto)
      .filter((job) => !input.chatId || job.chatId === input.chatId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(cloneJob);
  }

  subscribe(jobId: GenerationJobId, subscriber: GenerationJobEventSubscriber) {
    const subscribers = this.subscribers.get(jobId) ?? new Set<GenerationJobEventSubscriber>();

    subscribers.add(subscriber);
    this.subscribers.set(jobId, subscribers);

    return () => {
      subscribers.delete(subscriber);

      if (subscribers.size === 0) {
        this.subscribers.delete(jobId);
      }
    };
  }

  runChatReplyJob(
    jobId: GenerationJobId,
    runner: (input: ChatReplyGenerationJobRunnerInput) => Promise<ChatSessionDto>,
  ) {
    queueMicrotask(() => {
      void this.executeChatReplyJob(jobId, runner);
    });
  }

  private scheduleEviction(jobId: GenerationJobId) {
    const existingTimer = this.evictionTimers.get(jobId);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.evictionTimers.delete(jobId);
      this.jobs.delete(jobId);
      this.subscribers.delete(jobId);
    }, this.finishedJobTtlMs);

    timer.unref?.();
    this.evictionTimers.set(jobId, timer);
  }

  private emit(event: GenerationJobEvent) {
    const subscribers = this.subscribers.get(event.job.id);

    if (!subscribers) {
      return;
    }

    for (const subscriber of subscribers) {
      subscriber(event);
    }
  }

  private findActiveChatReplyJob(chatId: string) {
    const activeJob = [...this.jobs.values()]
      .map((storedJob) => storedJob.dto)
      .find((job) => job.chatId === chatId && job.kind === 'chat_reply' && isActiveStatus(job.status));

    return activeJob ? cloneJob(activeJob) : null;
  }

  private async executeChatReplyJob(
    jobId: GenerationJobId,
    runner: (input: ChatReplyGenerationJobRunnerInput) => Promise<ChatSessionDto>,
  ) {
    const storedJob = this.jobs.get(jobId);

    if (!storedJob || !isActiveStatus(storedJob.dto.status)) {
      return;
    }

    const runningJob = this.updateJob(jobId, {
      startedAt: new Date().toISOString(),
      status: 'running',
    });

    this.emit({
      job: runningJob,
      type: 'generation.job.updated',
    });

    try {
      const session = await runner({
        publishDelta: (delta, channel) => {
          const job = this.jobs.get(jobId);

          if (delta.length > 0 && job && isActiveStatus(job.dto.status)) {
            this.emit({ channel, delta, job: cloneJob(job.dto), type: 'chat.reply.delta' });
          }
        },
        signal: storedJob.controller.signal,
      });
      const latestJob = this.jobs.get(jobId);

      if (!latestJob || latestJob.controller.signal.aborted || latestJob.dto.status === 'canceled') {
        return;
      }

      const completedJob = this.updateJob(jobId, {
        completedAt: new Date().toISOString(),
        error: null,
        status: 'completed',
      });

      this.emit({
        job: completedJob,
        session,
        type: 'chat.session.updated',
      });
      this.emit({
        job: completedJob,
        type: 'generation.job.updated',
      });
    } catch (error) {
      const latestJob = this.jobs.get(jobId);

      if (!latestJob || latestJob.dto.status === 'canceled') {
        return;
      }

      const failedJob = this.updateJob(jobId, {
        completedAt: new Date().toISOString(),
        error: isAbortError(error) ? null : toProblem(error),
        status: isAbortError(error) ? 'canceled' : 'failed',
      });

      this.emit({
        job: failedJob,
        type: 'generation.job.updated',
      });
    }
  }

  private updateJob(
    jobId: GenerationJobId,
    patch: Pick<GenerationJobDto, 'status'> & Partial<Omit<GenerationJobDto, 'id' | 'kind' | 'chatId' | 'createdAt'>>,
  ) {
    const storedJob = this.jobs.get(jobId);

    if (!storedJob) {
      throw new Error(`Generation job not found: ${jobId}`);
    }

    const updatedJob: GenerationJobDto = {
      ...storedJob.dto,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    storedJob.dto = updatedJob;

    if (!isActiveStatus(updatedJob.status)) {
      this.scheduleEviction(jobId);
    }

    return cloneJob(updatedJob);
  }
}
