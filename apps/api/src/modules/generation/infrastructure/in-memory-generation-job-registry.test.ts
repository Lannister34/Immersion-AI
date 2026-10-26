import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { GenerationJobDto, GenerationJobEvent } from '@immersion/contracts/generation';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { InMemoryChatSessions } from '../../../test-support/in-memory-chat-sessions.js';
import { createManualClock } from '../../../test-support/manual-clock.js';
import { InMemoryGenerationJobRegistry } from './in-memory-generation-job-registry.js';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countTimersKeepingProcessAlive() {
  return process.getActiveResourcesInfo().filter((resource) => resource === 'Timeout').length;
}

describe('InMemoryGenerationJobRegistry eviction', () => {
  it('does not keep the process alive while a finished job waits for eviction', () => {
    const registry = new InMemoryGenerationJobRegistry({ clock: createManualClock() });
    const job = registry.createChatReplyJob({
      chatId: 'chat-0',
      command: { chatId: 'chat-0', message: 'hi', mode: 'reply' },
    });
    const timersBeforeFinish = countTimersKeepingProcessAlive();

    registry.fail(job.id, new Error('boom'));

    expect(registry.get(job.id)?.status).toBe('failed');
    expect(countTimersKeepingProcessAlive()).toBe(timersBeforeFinish);

    const referencedTimer = setTimeout(() => undefined, 60_000);
    expect(countTimersKeepingProcessAlive()).toBe(timersBeforeFinish + 1);
    clearTimeout(referencedTimer);
  });

  it('evicts failed jobs after the configured TTL', async () => {
    const registry = new InMemoryGenerationJobRegistry({ clock: createManualClock(), finishedJobTtlMs: 20 });
    const job = registry.createChatReplyJob({
      chatId: 'chat-1',
      command: { chatId: 'chat-1', message: 'hi', mode: 'reply' },
    });

    registry.fail(job.id, new Error('boom'));
    expect(registry.get(job.id)?.status).toBe('failed');

    await wait(60);

    expect(registry.get(job.id)).toBeNull();
    expect(registry.list()).toHaveLength(0);
  });

  it('evicts canceled jobs after the configured TTL', async () => {
    const registry = new InMemoryGenerationJobRegistry({ clock: createManualClock(), finishedJobTtlMs: 20 });
    const job = registry.createChatReplyJob({
      chatId: 'chat-2',
      command: { chatId: 'chat-2', message: 'hi', mode: 'reply' },
    });

    registry.cancel(job.id);
    expect(registry.get(job.id)?.status).toBe('canceled');

    await wait(60);

    expect(registry.get(job.id)).toBeNull();
  });

  it('keeps active jobs alive', async () => {
    const registry = new InMemoryGenerationJobRegistry({ clock: createManualClock(), finishedJobTtlMs: 20 });
    const job = registry.createChatReplyJob({
      chatId: 'chat-3',
      command: { chatId: 'chat-3', message: 'hi', mode: 'reply' },
    });

    await wait(60);

    expect(registry.get(job.id)?.status).toBe('queued');
  });
});

describe('InMemoryGenerationJobRegistry deltas', () => {
  it('stops relaying deltas once the job is canceled, so subscribers end on the canceled status', async () => {
    const registry = new InMemoryGenerationJobRegistry({ clock: createManualClock() });
    const job = registry.createChatReplyJob({
      chatId: 'chat-4',
      command: { chatId: 'chat-4', message: 'hi', mode: 'reply' },
    });
    const events: GenerationJobEvent[] = [];
    registry.subscribe(job.id, (event) => events.push(event));
    let publishReply: (delta: string) => void = () => undefined;
    let abortRunner: () => void = () => undefined;
    const runnerStarted = new Promise<void>((resolveStarted) => {
      registry.runChatReplyJob(job.id, ({ publishDelta }) => {
        publishReply = (delta) => publishDelta(delta, 'reply');
        resolveStarted();

        return new Promise<ChatSessionDto>((_resolve, reject) => {
          abortRunner = () => reject(new DOMException('Generation was canceled.', 'AbortError'));
        });
      });
    });

    await runnerStarted;
    publishReply('Пер');
    registry.cancel(job.id);
    publishReply('вый');
    abortRunner();
    await new Promise((resolve) => setImmediate(resolve));

    expect(events.flatMap((event) => (event.type === 'chat.reply.delta' ? [event.delta] : []))).toEqual(['Пер']);
    expect(events.at(-1)).toMatchObject({ job: { status: 'canceled' }, type: 'generation.job.updated' });
  });
});

describe('InMemoryGenerationJobRegistry clock', () => {
  it('stamps createdAt, startedAt and completedAt from the injected clock', async () => {
    const clock = createManualClock({ start: new Date('2026-03-01T10:00:00.000Z'), stepMs: 0 });
    const registry = new InMemoryGenerationJobRegistry({ clock });
    const session = new InMemoryChatSessions().create('chat-5', '2026-03-01T09:00:00.000Z');
    const job = registry.createChatReplyJob({
      chatId: 'chat-5',
      command: { chatId: 'chat-5', message: 'hi', mode: 'reply' },
    });
    const completed = new Promise<GenerationJobDto>((resolve) => {
      registry.subscribe(job.id, (event) => {
        if (event.type === 'generation.job.updated' && event.job.status === 'completed') {
          resolve(event.job);
        }
      });
    });
    clock.advance(1_000);

    registry.runChatReplyJob(job.id, () => {
      clock.advance(2_000);

      return Promise.resolve(session);
    });

    expect(job).toMatchObject({ createdAt: '2026-03-01T10:00:00.000Z', updatedAt: '2026-03-01T10:00:00.000Z' });
    expect(await completed).toMatchObject({
      completedAt: '2026-03-01T10:00:03.000Z',
      createdAt: '2026-03-01T10:00:00.000Z',
      startedAt: '2026-03-01T10:00:01.000Z',
      updatedAt: '2026-03-01T10:00:03.000Z',
    });
  });
});

describe('InMemoryGenerationJobRegistry close', () => {
  it('cancels active jobs, aborts their runners and clears the eviction timers', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const registry = new InMemoryGenerationJobRegistry({ clock: createManualClock() });
    const finished = registry.createChatReplyJob({
      chatId: 'chat-6',
      command: { chatId: 'chat-6', message: 'hi', mode: 'reply' },
    });
    registry.fail(finished.id, new Error('boom'));
    const active = registry.createChatReplyJob({
      chatId: 'chat-7',
      command: { chatId: 'chat-7', message: 'hi', mode: 'reply' },
    });
    const events: GenerationJobEvent[] = [];
    registry.subscribe(active.id, (event) => events.push(event));
    const runnerSignal = new Promise<AbortSignal>((resolveSignal) => {
      registry.runChatReplyJob(active.id, ({ signal }) => {
        resolveSignal(signal);

        return new Promise<ChatSessionDto>(() => undefined);
      });
    });
    const signal = await runnerSignal;

    expect(vi.getTimerCount()).toBe(1);

    registry.close();

    expect(signal.aborted).toBe(true);
    expect(registry.get(active.id)?.status).toBe('canceled');
    expect(events.at(-1)).toMatchObject({ job: { id: active.id, status: 'canceled' }, type: 'generation.job.updated' });
    expect(vi.getTimerCount()).toBe(0);
  });
});
