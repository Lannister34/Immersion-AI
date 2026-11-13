import type { ChatReplyPromptPreviewCommand, ChatReplyPromptPreviewResponse } from '@immersion/contracts/generation';
import { QueryObserver, type QueryObserverResult } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { buildChatReplyPromptPreview } from '../../../test-support/chat-reply-prompt-preview-fixture';
import { createTestQueryClient } from '../../../test-support/create-test-query-client';
import { previewChatReplyPrompt } from '../api/preview-chat-reply-prompt';
import { chatReplyPromptPreviewQueryOptions } from './chat-reply-prompt-preview-query';

vi.mock('../api/preview-chat-reply-prompt', () => ({ previewChatReplyPrompt: vi.fn() }));

const CHAT_ID = 'nochnaya-gavan';

interface PendingPreviews {
  resolve: (draftUserMessage: string, finalTotal: number) => void;
  requestedDrafts: () => string[];
}

function arrangePendingPreviews(): PendingPreviews {
  const pending = new Map<string, (response: ChatReplyPromptPreviewResponse) => void>();
  const requested: string[] = [];

  vi.mocked(previewChatReplyPrompt).mockImplementation((command: ChatReplyPromptPreviewCommand) => {
    const draft = command.draftUserMessage ?? '';
    requested.push(draft);
    return new Promise((resolve) => {
      pending.set(draft, resolve);
    });
  });

  return {
    resolve: (draftUserMessage, finalTotal) => {
      const resolve = pending.get(draftUserMessage);
      if (!resolve) throw new Error(`no preview request is pending for draft "${draftUserMessage}"`);
      resolve(
        buildChatReplyPromptPreview({
          budgetStatus: 'fits',
          finalTotal,
          maxContextLength: 32_768,
          maxTokens: 512,
          transcriptMessageCount: 1,
          trimmedMessageCount: 0,
        }),
      );
    },
    requestedDrafts: () => [...requested],
  };
}

function estimateOf(result: QueryObserverResult<ChatReplyPromptPreviewResponse>): number | undefined {
  return result.data?.diagnostics.tokenEstimate.finalTotal;
}

describe('chatReplyPromptPreviewQueryOptions', () => {
  it('a new draft key keeps showing the previous estimate while it loads', async () => {
    const previews = arrangePendingPreviews();
    const observer = new QueryObserver(createTestQueryClient(), chatReplyPromptPreviewQueryOptions(CHAT_ID, 'Прив'));
    const unsubscribe = observer.subscribe(() => undefined);

    await vi.waitFor(() => expect(previews.requestedDrafts()).toEqual(['Прив']));
    previews.resolve('Прив', 100);
    await vi.waitFor(() => expect(estimateOf(observer.getCurrentResult())).toBe(100));

    observer.setOptions(chatReplyPromptPreviewQueryOptions(CHAT_ID, 'Привет, капитан'));

    expect(estimateOf(observer.getCurrentResult())).toBe(100);
    expect(observer.getCurrentResult().isPlaceholderData).toBe(true);

    await vi.waitFor(() => expect(previews.requestedDrafts()).toEqual(['Прив', 'Привет, капитан']));
    previews.resolve('Привет, капитан', 140);
    await vi.waitFor(() => expect(estimateOf(observer.getCurrentResult())).toBe(140));
    expect(observer.getCurrentResult().isPlaceholderData).toBe(false);

    unsubscribe();
  });

  it('the draft-less estimate never stands in for a draft estimate', async () => {
    const previews = arrangePendingPreviews();
    const observer = new QueryObserver(createTestQueryClient(), chatReplyPromptPreviewQueryOptions(CHAT_ID));
    const unsubscribe = observer.subscribe(() => undefined);

    await vi.waitFor(() => expect(previews.requestedDrafts()).toEqual(['']));
    previews.resolve('', 90);
    await vi.waitFor(() => expect(estimateOf(observer.getCurrentResult())).toBe(90));

    observer.setOptions(chatReplyPromptPreviewQueryOptions(CHAT_ID, 'Держим курс'));

    expect(observer.getCurrentResult().data).toBeUndefined();

    await vi.waitFor(() => expect(previews.requestedDrafts()).toEqual(['', 'Держим курс']));
    previews.resolve('Держим курс', 120);
    await vi.waitFor(() => expect(estimateOf(observer.getCurrentResult())).toBe(120));

    unsubscribe();
  });

  it('the draft-less key does not change while the draft changes', async () => {
    const previews = arrangePendingPreviews();
    const queryClient = createTestQueryClient();
    const steadyObserver = new QueryObserver(queryClient, chatReplyPromptPreviewQueryOptions(CHAT_ID));
    const steadyEstimates: (number | undefined)[] = [];
    const unsubscribeSteady = steadyObserver.subscribe((result) => steadyEstimates.push(estimateOf(result)));

    await vi.waitFor(() => expect(previews.requestedDrafts()).toEqual(['']));
    previews.resolve('', 90);
    await vi.waitFor(() => expect(estimateOf(steadyObserver.getCurrentResult())).toBe(90));
    steadyEstimates.length = 0;

    const draftObserver = new QueryObserver(queryClient, chatReplyPromptPreviewQueryOptions(CHAT_ID, 'Д'));
    const unsubscribeDraft = draftObserver.subscribe(() => undefined);
    for (const [draft, finalTotal] of [
      ['Д', 95],
      ['Держим', 110],
      ['Держим курс на маяк', 130],
    ] as const) {
      draftObserver.setOptions(chatReplyPromptPreviewQueryOptions(CHAT_ID, draft));
      await vi.waitFor(() => expect(previews.requestedDrafts()).toContain(draft));
      previews.resolve(draft, finalTotal);
      await vi.waitFor(() => expect(estimateOf(draftObserver.getCurrentResult())).toBe(finalTotal));
    }

    expect(steadyEstimates).toEqual([]);
    expect(estimateOf(steadyObserver.getCurrentResult())).toBe(90);
    expect(previews.requestedDrafts().filter((draft) => draft === '')).toHaveLength(1);

    unsubscribeDraft();
    unsubscribeSteady();
  });
});
