import { CreateChatResponseSchema } from '@immersion/contracts/chats';
import type { GenerationJobDto } from '@immersion/contracts/generation';
import { describe, expect, it, vi } from 'vitest';

import { createManualClock } from '../../../test-support/manual-clock.js';
import { useTestApi } from '../../../test-support/use-test-api.js';
import { ChatTranscriptChangedError } from '../../chats/index.js';
import { heuristicTokenCounter } from '../../prompting/index.js';
import { resolveGenerationProviderEndpoint } from '../../providers/index.js';
import { getSettingsOverview } from '../../settings/index.js';
import { InMemoryGenerationJobRegistry } from '../infrastructure/in-memory-generation-job-registry.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import type { CreateChatReplyGenerationJobInput } from './generation-job-registry.js';
import { regenerateChatReplyJob } from './regenerate-chat-reply-job.js';

class ClaimRacingGenerationJobRegistry extends InMemoryGenerationJobRegistry {
  writeOnClaimDone: Promise<unknown> = Promise.resolve();

  constructor(private readonly writeOnClaim: () => Promise<unknown>) {
    super({ clock: createManualClock() });
  }

  override createChatReplyJob(input: CreateChatReplyGenerationJobInput): GenerationJobDto {
    const job = super.createChatReplyJob(input);

    this.writeOnClaimDone = this.writeOnClaim();

    return job;
  }
}

describe('regenerateChatReplyJob', () => {
  const api = useTestApi({ fixture: 'smoke' });

  it('refuses to delete the reply when the transcript changes after the job is claimed', async () => {
    const { chats, prompting } = api().modules;
    const completeChat = vi.fn<ChatCompletionClient['completeChat']>();
    const created = await api().app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: { title: 'Regenerate race' },
    });
    const { chat } = CreateChatResponseSchema.parse(created.json());
    await chats.appendChatMessages(chat.id, [
      { role: 'user', content: 'Расскажи анекдот.', createdAt: '2026-01-01T00:00:00.000Z' },
      { role: 'assistant', content: 'Заходит как-то улитка в бар.', createdAt: '2026-01-01T00:00:01.000Z' },
    ]);
    const registry = new ClaimRacingGenerationJobRegistry(() =>
      chats.appendChatMessages(chat.id, [
        { role: 'user', content: 'Я успел написать раньше.', createdAt: '2026-01-01T00:00:02.000Z' },
      ]),
    );

    await expect(
      regenerateChatReplyJob(
        { chatId: chat.id },
        {
          chatCompletionClient: { completeChat },
          chats,
          clock: createManualClock(),
          generationJobs: registry,
          prompting,
          providers: { resolveGenerationProviderEndpoint: () => resolveGenerationProviderEndpoint() },
          settings: { getSettingsOverview },
          tokenCounter: heuristicTokenCounter,
        },
      ),
    ).rejects.toBeInstanceOf(ChatTranscriptChangedError);
    await registry.writeOnClaimDone;
    const session = await chats.getChatSession(chat.id);

    expect(session?.messages.map(({ content, role }) => ({ content, role }))).toEqual([
      { role: 'user', content: 'Расскажи анекдот.' },
      { role: 'assistant', content: 'Заходит как-то улитка в бар.' },
      { role: 'user', content: 'Я успел написать раньше.' },
    ]);
    expect(registry.list({ chatId: chat.id }).map((job) => job.status)).toEqual(['failed']);
    expect(completeChat).not.toHaveBeenCalled();
  });
});
