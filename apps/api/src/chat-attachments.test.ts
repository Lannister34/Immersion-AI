import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import {
  CreateChatResponseSchema,
  GetChatSessionResponseSchema,
  UploadChatAttachmentResponseSchema,
} from '@immersion/contracts/chats';
import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_MAX_MEGABYTES } from '@immersion/contracts/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from './app.js';

const testSettings = {
  textgenerationwebui: { server_urls: { koboldcpp: 'http://127.0.0.1:5001' } },
};

function buildPngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  let crc = 0xff_ff_ff_ff;
  for (const byte of typeAndData) {
    crc = (table[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE((crc ^ 0xff_ff_ff_ff) >>> 0, 0);
  return Buffer.concat([length, typeAndData, crcBuffer]);
}

function buildPng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr.writeUInt8(8, 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    buildPngChunk('IHDR', ihdr),
    buildPngChunk('IDAT', zlib.deflateSync(Buffer.from([0x00, 0x00]))),
    buildPngChunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('chat attachments', () => {
  let previousDataRoot: string | undefined;
  let temporaryDataRoot: string;

  beforeEach(async () => {
    previousDataRoot = process.env.IMMERSION_DATA_ROOT;
    temporaryDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-api-attachments-'));
    await fs.writeFile(path.join(temporaryDataRoot, 'settings.json'), JSON.stringify(testSettings), 'utf8');
    process.env.IMMERSION_DATA_ROOT = temporaryDataRoot;
  });

  afterEach(async () => {
    if (previousDataRoot) {
      process.env.IMMERSION_DATA_ROOT = previousDataRoot;
    } else {
      delete process.env.IMMERSION_DATA_ROOT;
    }
    await fs.rm(temporaryDataRoot, { recursive: true, force: true });
  });

  async function createChat(app: ReturnType<typeof buildApiApp>) {
    const response = await app.inject({ method: 'POST', url: '/api/chats', payload: { title: 'Картинки' } });
    return CreateChatResponseSchema.parse(response.json()).chat;
  }

  async function uploadPng(app: ReturnType<typeof buildApiApp>, chatId: string) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/attachments`,
      payload: { contentBase64: buildPng().toString('base64'), mimeType: 'image/png' },
    });

    expect(response.statusCode).toBe(201);

    return UploadChatAttachmentResponseSchema.parse(response.json()).attachment;
  }

  it('stores an uploaded image next to the chat and serves it back', async () => {
    const app = buildApiApp();
    const chat = await createChat(app);
    const attachment = await uploadPng(app, chat.id);

    expect(attachment.mimeType).toBe('image/png');
    expect(attachment.url).toBe(`/api/chats/${chat.id}/attachments/${attachment.id}`);

    const stored = await fs.readFile(
      path.join(temporaryDataRoot, 'chats', '_no_character_', `${chat.id}.files`, attachment.id),
    );
    expect(stored.equals(buildPng())).toBe(true);

    const download = await app.inject({ method: 'GET', url: attachment.url });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toBe('image/png');

    await app.close();
  });

  it('rejects an image one byte over the image upload limit with its size message', async () => {
    const app = buildApiApp();
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

    await app.close();
  });

  it('rejects a file whose bytes are not the declared image format', async () => {
    const app = buildApiApp();
    const chat = await createChat(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/chats/${chat.id}/attachments`,
      payload: { contentBase64: Buffer.from('not an image').toString('base64'), mimeType: 'image/png' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'invalid_chat_attachment' });

    await app.close();
  });

  it('returns 404 for an attachment of another chat', async () => {
    const app = buildApiApp();
    const chat = await createChat(app);
    const otherChat = await createChat(app);
    const attachment = await uploadPng(app, chat.id);

    const response = await app.inject({
      method: 'GET',
      url: `/api/chats/${otherChat.id}/attachments/${attachment.id}`,
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it('keeps the attachment on the user message whatever the provider replies', async () => {
    const app = buildApiApp();
    const chat = await createChat(app);
    const attachment = await uploadPng(app, chat.id);

    const generation = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: { attachmentIds: [attachment.id], chatId: chat.id, message: 'Что на картинке?' },
    });
    expect([200, 409, 502]).toContain(generation.statusCode);

    const sessionResponse = await app.inject({ method: 'GET', url: `/api/chats/${chat.id}` });
    const session = GetChatSessionResponseSchema.parse(sessionResponse.json());
    const userMessage = session.messages.find((message) => message.role === 'user');

    expect(userMessage?.attachments).toEqual([{ id: attachment.id, mimeType: 'image/png', url: attachment.url }]);

    await app.close();
  });

  it('refuses to send an attachment that does not belong to the chat', async () => {
    const app = buildApiApp();
    const chat = await createChat(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: { attachmentIds: ['missing.png'], chatId: chat.id, message: 'Что на картинке?' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'chat_attachment_not_found' });

    await app.close();
  });

  it('removes stored attachments together with the chat', async () => {
    const app = buildApiApp();
    const chat = await createChat(app);
    await uploadPng(app, chat.id);

    const attachmentsDir = path.join(temporaryDataRoot, 'chats', '_no_character_', `${chat.id}.files`);
    await expect(fs.access(attachmentsDir)).resolves.toBeUndefined();

    const deleted = await app.inject({ method: 'DELETE', url: `/api/chats/${chat.id}` });
    expect(deleted.statusCode).toBe(204);
    await expect(fs.access(attachmentsDir)).rejects.toThrow();

    await app.close();
  });
});
