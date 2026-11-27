import type { ChatMessageAttachmentDto } from '@immersion/contracts/chats';
import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderHookWithProviders } from '../../../test-support/render-with-providers';
import { stubFetch } from '../../../test-support/stub-fetch';
import { useChatAttachments } from './use-chat-attachments';

const CHAT_ID = 'chat-1';

const UPLOADED: ChatMessageAttachmentDto = {
  id: 'lighthouse.png',
  mimeType: 'image/png',
  url: `/api/chats/${CHAT_ID}/attachments/lighthouse.png`,
};

describe('useChatAttachments', () => {
  it('puts the images of a failed send back into the cleared draft', async () => {
    stubFetch().mockImplementation((input, init) =>
      String(input).endsWith(`/api/chats/${CHAT_ID}/attachments`) && init?.method === 'POST'
        ? Promise.resolve(Response.json({ attachment: UPLOADED }, { status: 201 }))
        : new Promise<Response>(() => {}),
    );
    const { result } = await renderHookWithProviders(() => useChatAttachments(CHAT_ID));

    act(() => {
      result.current.attach([new File([new Uint8Array([137, 80, 78, 71])], 'маяк.png', { type: 'image/png' })]);
    });
    await waitFor(() => expect(result.current.attachments).toEqual([UPLOADED]));

    const sent = result.current.attachments;
    act(() => {
      result.current.clear();
    });
    expect(result.current.attachments).toEqual([]);

    act(() => {
      result.current.restore(sent);
    });
    expect(result.current.attachments).toEqual([UPLOADED]);
  });
});
