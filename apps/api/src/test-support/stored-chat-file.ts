import fs from 'node:fs/promises';

import {
  type StoredChatHeaderFixture,
  StoredChatHeaderFixtureSchema,
  type StoredChatMessageFixture,
  StoredChatMessageFixtureSchema,
} from './stored-chat-line-fixture-schema.js';

export interface StoredChatFile {
  readonly header: StoredChatHeaderFixture;
  readonly messages: readonly StoredChatMessageFixture[];
}

export async function readStoredChatFile(filePath: string): Promise<StoredChatFile> {
  const lines = (await fs.readFile(filePath, 'utf8')).split(/\r?\n/u).filter((line) => line.trim().length > 0);
  const [headerLine, ...messageLines] = lines;

  if (headerLine === undefined) {
    throw new Error(`The stored chat file ${filePath} has no header line.`);
  }

  return {
    header: StoredChatHeaderFixtureSchema.parse(JSON.parse(headerLine)),
    messages: messageLines.map((line) => StoredChatMessageFixtureSchema.parse(JSON.parse(line))),
  };
}
