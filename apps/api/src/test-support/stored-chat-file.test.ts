import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';
import { z } from 'zod';

import { readStoredChatFile } from './stored-chat-file.js';
import { createTemporaryProject } from './temporary-project.js';

const HEADER = {
  chat_metadata: { createdAt: '2026-01-01T00:00:00.000Z', title: 'Чат', updatedAt: '2026-01-01T00:00:01.000Z' },
  user_name: 'Тестер',
};

async function chatFileWith(content: string) {
  const project = await createTemporaryProject('empty');
  onTestFinished(() => project.remove());
  const filePath = path.join(project.dataRoot, 'chat.jsonl');
  await fs.writeFile(filePath, content, 'utf8');

  return filePath;
}

describe('readStoredChatFile', () => {
  it('reads the header and the messages, skipping blank lines and CRLF endings, Cyrillic included', async () => {
    const message = { is_user: true, mes: 'Привет 🐉', send_date: '2026-01-01T00:00:01.000Z', extra: { a: 1 } };
    const filePath = await chatFileWith(`${JSON.stringify(HEADER)}\r\n\r\n${JSON.stringify(message)}\r\n`);

    expect(await readStoredChatFile(filePath)).toEqual({ header: HEADER, messages: [message] });
  });

  it('fails on a message line of the wrong shape instead of handing the test a misread file', async () => {
    const filePath = await chatFileWith(
      `${JSON.stringify(HEADER)}\n${JSON.stringify({ is_user: 'yes', mes: 'x', send_date: '' })}\n`,
    );

    await expect(readStoredChatFile(filePath)).rejects.toThrow(z.ZodError);
  });

  it('fails on a truncated line and on a file without a header', async () => {
    await expect(readStoredChatFile(await chatFileWith(`${JSON.stringify(HEADER)}\n{"is_user":tr`))).rejects.toThrow(
      SyntaxError,
    );
    await expect(readStoredChatFile(await chatFileWith('\n\n'))).rejects.toThrow('has no header line');
  });
});
