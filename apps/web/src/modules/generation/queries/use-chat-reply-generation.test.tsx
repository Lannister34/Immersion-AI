import type { ChatMessageAttachmentDto, ChatSessionDto } from '@immersion/contracts/chats';
import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderHookWithProviders } from '../../../test-support/render-with-providers';
import { stubFetch } from '../../../test-support/stub-fetch';
import { chatSessionQueryKey } from '../../chats/queries/chat-session-query';
import { useChatReplyGeneration } from './use-chat-reply-generation';

const CHAT_ID = 'chat-1';

const PICTURE: ChatMessageAttachmentDto = {
  id: 'picture.png',
  mimeType: 'image/png',
  url: `/api/chats/${CHAT_ID}/attachments/picture.png`,
};

const SESSION: ChatSessionDto = {
  characterAvatarUrl: null,
  characterId: null,
  characterName: null,
  chat: {
    characterAvatarUrl: null,
    characterId: null,
    characterName: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    id: CHAT_ID,
    lastMessagePreview: 'Привет!',
    lorebookIds: [],
    messageCount: 1,
    scenarioId: null,
    scenarioName: null,
    title: 'Маяк',
    updatedAt: '2026-11-01T10:00:00.000Z',
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
      content: 'Привет!',
      createdAt: '2026-11-01T10:00:00.000Z',
      id: 'message-1',
      reasoning: null,
      role: 'assistant',
      stoppedAtTokenLimit: false,
    },
  ],
  scenarioId: null,
  scenarioName: null,
  userName: 'User',
};

interface HeldStart {
  body: Promise<unknown>;
  fail: () => void;
}

function holdStartRequest(): HeldStart {
  let resolveBody: (body: unknown) => void = () => undefined;
  let respond: (response: Response) => void = () => undefined;
  const body = new Promise<unknown>((resolve) => {
    resolveBody = resolve;
  });

  stubFetch().mockImplementation((input, init) => {
    const url = String(input);
    if (url.includes('/api/generation/jobs')) {
      return Promise.resolve(Response.json({ items: [] }));
    }
    if (url.endsWith('/api/generation/chat-reply-jobs') && init?.method === 'POST') {
      resolveBody(JSON.parse(String(init.body)));
      return new Promise<Response>((resolve) => {
        respond = resolve;
      });
    }
    return new Promise<Response>(() => {});
  });

  return {
    body,
    fail: () =>
      respond(Response.json({ code: 'provider_unavailable', message: 'Модель недоступна.' }, { status: 503 })),
  };
}

describe('useChatReplyGeneration start', () => {
  it('sends an image-only message, shows its images in the optimistic bubble and rolls it back on failure', async () => {
    const held = holdStartRequest();
    const { queryClient, result } = await renderHookWithProviders(() => useChatReplyGeneration(CHAT_ID));
    queryClient.setQueryData(chatSessionQueryKey(CHAT_ID), SESSION);

    let started: Promise<unknown> = Promise.resolve();
    act(() => {
      started = result.current.start('', [PICTURE]);
    });

    expect(await held.body).toEqual({ attachmentIds: [PICTURE.id], chatId: CHAT_ID, message: '', mode: 'reply' });
    await waitFor(() => expect(result.current.isSendingMessage).toBe(true));
    expect(queryClient.getQueryData<ChatSessionDto>(chatSessionQueryKey(CHAT_ID))?.messages.at(-1)).toMatchObject({
      attachments: [PICTURE],
      content: '',
      role: 'user',
    });

    await act(async () => {
      held.fail();
      await started.catch(() => undefined);
    });

    await expect(started).rejects.toThrow();
    expect(queryClient.getQueryData(chatSessionQueryKey(CHAT_ID))).toEqual(SESSION);
    await waitFor(() => expect(result.current.isSendingMessage).toBe(false));
  });
});
