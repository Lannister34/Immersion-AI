import { describe, expect, it } from 'vitest';

import { InMemoryGenerationJobRegistry } from './in-memory-generation-job-registry.js';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('InMemoryGenerationJobRegistry eviction', () => {
  it('evicts failed jobs after the configured TTL', async () => {
    const registry = new InMemoryGenerationJobRegistry({ finishedJobTtlMs: 20 });
    const job = registry.createChatReplyJob({ chatId: 'chat-1', command: { chatId: 'chat-1', message: 'hi' } });

    registry.fail(job.id, new Error('boom'));
    expect(registry.get(job.id)?.status).toBe('failed');

    await wait(60);

    expect(registry.get(job.id)).toBeNull();
    expect(registry.list()).toHaveLength(0);
  });

  it('evicts canceled jobs after the configured TTL', async () => {
    const registry = new InMemoryGenerationJobRegistry({ finishedJobTtlMs: 20 });
    const job = registry.createChatReplyJob({ chatId: 'chat-2', command: { chatId: 'chat-2', message: 'hi' } });

    registry.cancel(job.id);
    expect(registry.get(job.id)?.status).toBe('canceled');

    await wait(60);

    expect(registry.get(job.id)).toBeNull();
  });

  it('keeps active jobs alive', async () => {
    const registry = new InMemoryGenerationJobRegistry({ finishedJobTtlMs: 20 });
    const job = registry.createChatReplyJob({ chatId: 'chat-3', command: { chatId: 'chat-3', message: 'hi' } });

    await wait(60);

    expect(registry.get(job.id)?.status).toBe('queued');
  });
});
