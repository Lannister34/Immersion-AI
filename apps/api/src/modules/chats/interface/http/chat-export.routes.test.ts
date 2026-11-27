import { CreateChatResponseSchema } from '@immersion/contracts/chats';
import { describe, expect, it } from 'vitest';

import { useTestApi } from '../../../../test-support/use-test-api.js';

const EMOJI = '\u{1F409}';
const LONE_HIGH_SURROGATE = '\uD83D';
const FILE_NAME_PARAMETER = /filename\*=UTF-8''(?<encoded>[^;]+)$/u;

describe('chat export route: the file name', () => {
  const api = useTestApi();

  async function exportedFileNameOf(title: string): Promise<string> {
    const created = await api().app.inject({ method: 'POST', url: '/api/chats', payload: { title } });
    const { chat } = CreateChatResponseSchema.parse(created.json());

    const response = await api().app.inject({ method: 'GET', url: `/api/chats/${chat.id}/export` });

    expect(response.statusCode).toBe(200);
    const encoded = String(response.headers['content-disposition']).match(FILE_NAME_PARAMETER)?.groups?.encoded;
    return decodeURIComponent(encoded ?? '');
  }

  it('exports a chat whose title puts an emoji across the 80th character', async () => {
    expect(await exportedFileNameOf(`${'a'.repeat(79)}${EMOJI}b`)).toBe(`${'a'.repeat(79)}${EMOJI}.jsonl`);
  });

  it('exports a chat whose title holds a lone surrogate', async () => {
    expect(await exportedFileNameOf(`Сказка ${LONE_HIGH_SURROGATE}`)).toBe('Сказка__.jsonl');
  });

  it('exports a chat whose title ends in a dot or names a Windows device under a name Windows can save', async () => {
    expect(await exportedFileNameOf('Mr.')).toBe('Mr.jsonl');
    expect(await exportedFileNameOf('NUL')).toBe('_NUL.jsonl');
  });
});
