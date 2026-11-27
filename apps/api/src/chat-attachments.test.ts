import fs from 'node:fs/promises';
import path from 'node:path';

import {
  CreateChatResponseSchema,
  GetChatSessionResponseSchema,
  UploadChatAttachmentResponseSchema,
} from '@immersion/contracts/chats';
import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_MAX_MEGABYTES } from '@immersion/contracts/common';
import { StartChatReplyGenerationJobResponseSchema } from '@immersion/contracts/generation';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { snapshotDataRoot } from './test-support/data-root-snapshot.js';
import { waitForGenerationJob } from './test-support/generation-jobs.js';
import { buildPng } from './test-support/png-image.js';
import type { TestApi } from './test-support/test-api.js';
import { useTestApi } from './test-support/use-test-api.js';

const PROVIDER_URL = 'http://127.0.0.1:6006';

const ChatCompletionRequestBodySchema = z.looseObject({ messages: z.array(z.unknown()) });

describe('chat attachments', () => {
  const api = useTestApi();

  beforeEach(async () => {
    await api().settings.write({
      activeProvider: 'custom',
      backendMode: 'external',
      providerConfigs: { custom: { model: 'vision-model', url: PROVIDER_URL } },
    });
  });

  async function createChat(app: TestApi['app']) {
    const response = await app.inject({ method: 'POST', url: '/api/chats', payload: { title: 'Картинки' } });
    return CreateChatResponseSchema.parse(response.json()).chat;
  }

  async function uploadPng(app: TestApi['app'], chatId: string) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/attachments`,
      payload: { contentBase64: buildPng().toString('base64'), mimeType: 'image/png' },
    });

    expect(response.statusCode).toBe(201);

    return UploadChatAttachmentResponseSchema.parse(response.json()).attachment;
  }

  it('stores an uploaded image next to the chat and serves it back', async () => {
    const { app, dataRoot } = api();
    const chat = await createChat(app);
    const attachment = await uploadPng(app, chat.id);

    expect(attachment.mimeType).toBe('image/png');
    expect(attachment.url).toBe(`/api/chats/${chat.id}/attachments/${attachment.id}`);

    const stored = await fs.readFile(path.join(dataRoot, 'chats', '_no_character_', `${chat.id}.files`, attachment.id));
    expect(stored.equals(buildPng())).toBe(true);

    const download = await app.inject({ method: 'GET', url: attachment.url });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toBe('image/png');
  });

  it('rejects an image one byte over the image upload limit with its size message', async () => {
    const { app } = api();
    const chat = await createChat(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/chats/${chat.id}/attachments`,
      payload: { contentBase64: Buffer.alloc(IMAGE_UPLOAD_MAX_BYTES + 1).toString('base64'), mimeType: 'image/png' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: 'invalid_chat_attachment',
      message: `Изображение больше ${IMAGE_UPLOAD_MAX_MEGABYTES} МБ.`,
    });
  });

  it('rejects a file whose bytes are not the declared image format', async () => {
    const { app } = api();
    const chat = await createChat(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/chats/${chat.id}/attachments`,
      payload: { contentBase64: Buffer.from('not an image').toString('base64'), mimeType: 'image/png' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'invalid_chat_attachment' });
  });

  it('rejects an attachment upload without base64 data with 400 validation_error', async () => {
    const { app, dataRoot } = api();
    const chat = await createChat(app);
    const before = await snapshotDataRoot(dataRoot);

    const response = await app.inject({
      method: 'POST',
      url: `/api/chats/${chat.id}/attachments`,
      payload: { mimeType: 'image/png' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_error' });
    expect(await snapshotDataRoot(dataRoot)).toEqual(before);
  });

  it('returns 404 for an attachment of another chat', async () => {
    const { app } = api();
    const chat = await createChat(app);
    const otherChat = await createChat(app);
    const attachment = await uploadPng(app, chat.id);

    const response = await app.inject({
      method: 'GET',
      url: `/api/chats/${otherChat.id}/attachments/${attachment.id}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      code: 'chat_attachment_not_found',
      message: 'Вложение не найдено — загрузите изображение заново.',
    });
  });

  it.each([
    {
      provider: 'replies',
      providerBody: { choices: [{ message: { content: 'Чёрный пиксель.' } }] },
      providerStatus: 200,
      replyStatus: 200,
    },
    { provider: 'fails with 500', providerBody: { error: 'provider failed' }, providerStatus: 500, replyStatus: 502 },
  ])('sends the image and keeps the attachment on the user message when the provider $provider', async ({
    providerBody,
    providerStatus,
    replyStatus,
  }) => {
    const { app, http } = api();
    http.on('POST', `${PROVIDER_URL}/v1/chat/completions`, () =>
      Response.json(providerBody, { status: providerStatus }),
    );
    const chat = await createChat(app);
    const attachment = await uploadPng(app, chat.id);

    const generation = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: { attachmentIds: [attachment.id], chatId: chat.id, message: 'Что на картинке?' },
    });

    expect(generation.statusCode).toBe(replyStatus);
    expect(http.requests.map((request) => request.url)).toEqual([`${PROVIDER_URL}/v1/chat/completions`]);
    expect(http.requests[0]?.json(ChatCompletionRequestBodySchema)).toMatchObject({
      messages: expect.arrayContaining([
        {
          content: [
            { text: 'Что на картинке?', type: 'text' },
            { image_url: { url: `data:image/png;base64,${buildPng().toString('base64')}` }, type: 'image_url' },
          ],
          role: 'user',
        },
      ]),
    });

    const sessionResponse = await app.inject({ method: 'GET', url: `/api/chats/${chat.id}` });
    const session = GetChatSessionResponseSchema.parse(sessionResponse.json());
    const userMessage = session.messages.find((message) => message.role === 'user');

    expect(userMessage?.attachments).toEqual([{ id: attachment.id, mimeType: 'image/png', url: attachment.url }]);
  });

  it('sends a message that has only an image as an image part without a text part, and keeps it for the answer', async () => {
    const { app, http } = api();
    http.once('POST', `${PROVIDER_URL}/v1/chat/completions`, () =>
      Response.json({ error: 'provider failed' }, { status: 500 }),
    );
    const chat = await createChat(app);
    const attachment = await uploadPng(app, chat.id);
    const imageOnlyTurn = {
      content: [{ image_url: { url: `data:image/png;base64,${buildPng().toString('base64')}` }, type: 'image_url' }],
      role: 'user',
    };

    const failed = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: { attachmentIds: [attachment.id], chatId: chat.id, message: '  ' },
    });

    expect(failed.statusCode).toBe(502);
    expect(http.requests[0]?.json(ChatCompletionRequestBodySchema).messages.at(-1)).toEqual(imageOnlyTurn);

    const afterFailure = GetChatSessionResponseSchema.parse(
      (await app.inject({ method: 'GET', url: `/api/chats/${chat.id}` })).json(),
    );
    expect(afterFailure.messages.at(-1)).toMatchObject({
      attachments: [{ id: attachment.id, mimeType: 'image/png', url: attachment.url }],
      content: '',
      role: 'user',
    });

    http.on('POST', `${PROVIDER_URL}/v1/chat/completions`, () =>
      Response.json({ choices: [{ message: { content: 'Чёрный пиксель.' } }] }),
    );
    const answered = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: { chatId: chat.id, mode: 'answer' },
    });

    expect(answered.statusCode).toBe(200);
    expect(http.requests[1]?.json(ChatCompletionRequestBodySchema).messages.at(-1)).toEqual(imageOnlyTurn);
    const afterAnswer = GetChatSessionResponseSchema.parse(
      (await app.inject({ method: 'GET', url: `/api/chats/${chat.id}` })).json(),
    );
    expect(afterAnswer.messages.map(({ content, role }) => ({ content, role }))).toEqual([
      { content: '', role: 'user' },
      { content: 'Чёрный пиксель.', role: 'assistant' },
    ]);
  });

  it('runs a reply job for a message that has only an image, as the web sends it', async () => {
    const testApi = api();
    testApi.http.on('POST', `${PROVIDER_URL}/v1/chat/completions`, () =>
      Response.json({ choices: [{ message: { content: 'Чёрный пиксель.' } }] }),
    );
    const chat = await createChat(testApi.app);
    const attachment = await uploadPng(testApi.app, chat.id);

    const started = await testApi.app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: { attachmentIds: [attachment.id], chatId: chat.id, message: '', mode: 'reply' },
    });

    expect(started.statusCode).toBe(202);
    const { job, session } = StartChatReplyGenerationJobResponseSchema.parse(started.json());
    expect(session.messages.at(-1)).toMatchObject({ attachments: [{ id: attachment.id }], content: '', role: 'user' });

    await waitForGenerationJob(testApi, job.id, 'completed');

    expect(testApi.http.requests[0]?.json(ChatCompletionRequestBodySchema).messages.at(-1)).toEqual({
      content: [{ image_url: { url: `data:image/png;base64,${buildPng().toString('base64')}` }, type: 'image_url' }],
      role: 'user',
    });
    const after = GetChatSessionResponseSchema.parse(
      (await testApi.app.inject({ method: 'GET', url: `/api/chats/${chat.id}` })).json(),
    );
    expect(after.messages.at(-1)).toMatchObject({ content: 'Чёрный пиксель.', role: 'assistant' });
  });

  it('refuses a message that has neither text nor images without calling the provider', async () => {
    const { app, http } = api();
    const chat = await createChat(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: { attachmentIds: [], chatId: chat.id, message: ' \n ' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_error' });
    expect(http.requests).toEqual([]);
  });

  it('refuses to send an attachment that does not belong to the chat', async () => {
    const { app } = api();
    const chat = await createChat(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: { attachmentIds: ['missing.png'], chatId: chat.id, message: 'Что на картинке?' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'chat_attachment_not_found' });
  });

  it('removes stored attachments together with the chat', async () => {
    const { app, dataRoot } = api();
    const chat = await createChat(app);
    await uploadPng(app, chat.id);

    const attachmentsDir = path.join(dataRoot, 'chats', '_no_character_', `${chat.id}.files`);
    await expect(fs.access(attachmentsDir)).resolves.toBeUndefined();

    const deleted = await app.inject({ method: 'DELETE', url: `/api/chats/${chat.id}` });
    expect(deleted.statusCode).toBe(204);
    await expect(fs.access(attachmentsDir)).rejects.toThrow();
  });
});
