import type { ChatMessageAttachmentDto } from '@immersion/contracts/chats';
import { CHAT_MESSAGE_MAX_ATTACHMENTS } from '@immersion/contracts/common';
import { act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../../shared/api/client';
import { renderHookWithProviders } from '../../../test-support/render-with-providers';
import { stubFetch } from '../../../test-support/stub-fetch';
import { type ChatDraftStore, createChatDraftStore } from '../drafts/chat-draft-store';
import { type SendChatMessage, useChatDraft } from './use-chat-draft';
import { useDeleteChat } from './use-delete-chat';

const CHAT_ID = 'chat-1';
const OTHER_CHAT_ID = 'chat-2';

function attachmentOf(id: string, chatId = CHAT_ID): ChatMessageAttachmentDto {
  return { id, mimeType: 'image/png', url: `/api/chats/${chatId}/attachments/${id}` };
}

const LIGHTHOUSE = attachmentOf('lighthouse.png');

function png(name = 'маяк.png'): File {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });
}

interface HeldUploads {
  count: () => number;
  fail: (index: number) => void;
  succeed: (index: number, attachment: ChatMessageAttachmentDto) => void;
}

function holdUploads(): HeldUploads {
  const pending: ((response: Response) => void)[] = [];

  stubFetch().mockImplementation((input, init) => {
    const url = String(input);
    if (/\/api\/chats\/[^/]+\/attachments$/.test(url) && init?.method === 'POST') {
      return new Promise<Response>((resolve) => {
        pending.push(resolve);
      });
    }
    if (/\/api\/chats\/[^/]+$/.test(url) && init?.method === 'DELETE') {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return new Promise<Response>(() => {});
  });

  return {
    count: () => pending.length,
    fail: (index) =>
      pending[index]?.(Response.json({ code: 'invalid_chat_attachment', message: 'Файл повреждён.' }, { status: 400 })),
    succeed: (index, attachment) => pending[index]?.(Response.json({ attachment }, { status: 201 })),
  };
}

function mountDraft(store: ChatDraftStore, chatId = CHAT_ID) {
  return renderHookWithProviders(() => useChatDraft(chatId), { chatDraftStore: store });
}

interface HeldSend {
  fail: (error: unknown) => void;
  sendMessage: SendChatMessage;
  succeed: () => void;
}

function holdSend(): HeldSend {
  let settle: { reject: (error: unknown) => void; resolve: () => void } | null = null;
  const sendMessage = vi.fn<SendChatMessage>(
    () =>
      new Promise<void>((resolve, reject) => {
        settle = { reject, resolve };
      }),
  );
  return {
    fail: (error) => settle?.reject(error),
    sendMessage,
    succeed: () => settle?.resolve(),
  };
}

describe('useChatDraft', () => {
  it('keeps the text and the images of a chat when its screen unmounts and mounts again', async () => {
    const uploads = holdUploads();
    const store = createChatDraftStore();
    const first = await mountDraft(store);

    act(() => {
      first.result.current.setText('Держим курс на маяк');
      first.result.current.attach([png()]);
    });
    await waitFor(() => expect(uploads.count()).toBe(1));
    await act(async () => uploads.succeed(0, LIGHTHOUSE));
    await waitFor(() => expect(first.result.current.attachments).toEqual([LIGHTHOUSE]));
    first.unmount();

    const second = await mountDraft(store);

    expect(second.result.current.text).toBe('Держим курс на маяк');
    expect(second.result.current.attachments).toEqual([LIGHTHOUSE]);
  });

  it('never mixes the drafts of two chats', async () => {
    holdUploads();
    const store = createChatDraftStore();
    const first = await mountDraft(store, CHAT_ID);
    const other = await mountDraft(store, OTHER_CHAT_ID);

    act(() => first.result.current.setText('Первый чат'));
    act(() => other.result.current.setText('Второй чат'));

    expect(first.result.current.text).toBe('Первый чат');
    expect(other.result.current.text).toBe('Второй чат');
  });

  it('puts an image whose upload finishes after the screen unmounted into that chat draft', async () => {
    const uploads = holdUploads();
    const store = createChatDraftStore();
    const first = await mountDraft(store);

    act(() => first.result.current.attach([png()]));
    await waitFor(() => expect(uploads.count()).toBe(1));
    first.unmount();

    const second = await mountDraft(store);
    expect(second.result.current.uploadingCount).toBe(1);

    await act(async () => uploads.succeed(0, LIGHTHOUSE));

    await waitFor(() => expect(second.result.current.attachments).toEqual([LIGHTHOUSE]));
    expect(second.result.current.uploadingCount).toBe(0);
  });

  it('keeps an upload error that arrives after the screen unmounted', async () => {
    const uploads = holdUploads();
    const store = createChatDraftStore();
    const first = await mountDraft(store);

    act(() => first.result.current.attach([png()]));
    await waitFor(() => expect(uploads.count()).toBe(1));
    first.unmount();
    await act(async () => uploads.fail(0));

    await waitFor(() => expect(store.read(CHAT_ID).uploadingCount).toBe(0));
    const second = await mountDraft(store);
    expect(second.result.current.attachmentsError).toBe('Файл повреждён.');
    expect(second.result.current.attachments).toEqual([]);
  });

  it('counts uploads still in flight against the per-message image limit', async () => {
    const uploads = holdUploads();
    const store = createChatDraftStore();
    const { result } = await mountDraft(store);

    act(() => result.current.attach(Array.from({ length: CHAT_MESSAGE_MAX_ATTACHMENTS }, () => png())));
    act(() => result.current.attach([png('лишний.png')]));

    expect(result.current.attachmentsError).toBe(
      `К одному сообщению можно приложить не больше ${CHAT_MESSAGE_MAX_ATTACHMENTS} изображений.`,
    );
    expect(result.current.uploadingCount).toBe(CHAT_MESSAGE_MAX_ATTACHMENTS);
    await waitFor(() => expect(uploads.count()).toBe(CHAT_MESSAGE_MAX_ATTACHMENTS));
  });

  it('clears only what was sent when the send succeeds, and keeps text typed meanwhile', async () => {
    holdUploads();
    const store = createChatDraftStore();
    store.update(CHAT_ID, (draft) => ({ ...draft, attachments: [LIGHTHOUSE], text: 'Первое' }));
    const send = holdSend();
    const { result } = await mountDraft(store);

    let sending: Promise<void> = Promise.resolve();
    act(() => {
      sending = result.current.send(send.sendMessage);
    });
    expect(send.sendMessage).toHaveBeenCalledExactlyOnceWith('Первое', [LIGHTHOUSE]);
    expect(result.current).toMatchObject({ attachments: [], isSending: true, text: '' });

    act(() => result.current.setText('Второе'));
    await act(async () => {
      send.succeed();
      await sending;
    });

    expect(result.current).toMatchObject({ attachments: [], isSending: false, sendError: null, text: 'Второе' });
  });

  it('puts a send that fails after the screen unmounted back into the chat draft, with its error', async () => {
    holdUploads();
    const store = createChatDraftStore();
    store.update(CHAT_ID, (draft) => ({ ...draft, attachments: [LIGHTHOUSE], text: 'Первое' }));
    const send = holdSend();
    const first = await mountDraft(store);

    let sending: Promise<void> = Promise.resolve();
    act(() => {
      sending = first.result.current.send(send.sendMessage);
    });
    first.unmount();

    const second = await mountDraft(store);
    expect(second.result.current.isSending).toBe(true);
    act(() => second.result.current.setText('Второе'));

    await act(async () => {
      send.fail(new ApiError('Встроенный сервер не запущен.', 409, 'generation_provider_unavailable'));
      await sending;
    });

    expect(second.result.current).toMatchObject({
      attachments: [LIGHTHOUSE],
      isSending: false,
      sendError: 'Встроенный сервер не запущен.',
      text: 'Первое\nВторое',
    });
  });

  it('keeps a restored image whose file is gone removable after the send refuses it', async () => {
    holdUploads();
    const store = createChatDraftStore();
    const missing = attachmentOf('missing.png');
    store.update(CHAT_ID, (draft) => ({ ...draft, attachments: [missing], text: 'Смотри' }));
    const send = holdSend();
    const { result } = await mountDraft(store);

    let sending: Promise<void> = Promise.resolve();
    act(() => {
      sending = result.current.send(send.sendMessage);
    });
    await act(async () => {
      send.fail(new ApiError('Вложение не найдено — загрузите изображение заново.', 404, 'chat_attachment_not_found'));
      await sending;
    });
    expect(result.current.sendError).toBe('Вложение не найдено — загрузите изображение заново.');

    act(() => result.current.remove(missing.id));

    expect(result.current).toMatchObject({ attachments: [], text: 'Смотри' });
  });

  it('drops the draft of a deleted chat, also when its upload finishes later', async () => {
    const uploads = holdUploads();
    const store = createChatDraftStore();
    const draft = await mountDraft(store);
    const deletion = await renderHookWithProviders(() => useDeleteChat(CHAT_ID), { chatDraftStore: store });

    act(() => {
      draft.result.current.setText('Черновик');
      draft.result.current.attach([png()]);
    });
    await waitFor(() => expect(uploads.count()).toBe(1));
    await act(async () => {
      await deletion.result.current.mutateAsync();
    });
    expect(store.read(CHAT_ID).text).toBe('');

    await act(async () => uploads.succeed(0, LIGHTHOUSE));

    await waitFor(() => expect(draft.queryClient.isMutating()).toBe(0));
    expect(store.read(CHAT_ID)).toMatchObject({ attachments: [], text: '' });
  });
});
