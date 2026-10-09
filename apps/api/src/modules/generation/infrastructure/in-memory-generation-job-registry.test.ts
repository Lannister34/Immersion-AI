import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { GenerationJobEvent } from '@immersion/contracts/generation';
import { describe, expect, it } from 'vitest';

import { InMemoryGenerationJobRegistry } from './in-memory-generation-job-registry.js';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countTimersKeepingProcessAlive() {
  return process.getActiveResourcesInfo().filter((resource) => resource === 'Timeout').length;
}

describe('InMemoryGenerationJobRegistry eviction', () => {
  it('does not keep the process alive while a finished job waits for eviction', () => {
    const registry = new InMemoryGenerationJobRegistry();
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
    const registry = new InMemoryGenerationJobRegistry({ finishedJobTtlMs: 20 });
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
    const registry = new InMemoryGenerationJobRegistry({ finishedJobTtlMs: 20 });
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
    const registry = new InMemoryGenerationJobRegistry({ finishedJobTtlMs: 20 });
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
    const registry = new InMemoryGenerationJobRegistry();
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
