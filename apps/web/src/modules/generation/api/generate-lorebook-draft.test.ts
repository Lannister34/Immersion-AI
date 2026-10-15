import { GenerateLorebookDraftCommandSchema } from '@immersion/contracts/generation';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateLorebookDraft } from './generate-lorebook-draft';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateLorebookDraft', () => {
  it('asks for the entry count the contract defaults to', async () => {
    const draft = { entries: [{ content: 'Пристань у маяка.', keys: ['маяк'] }], name: 'Побережье' };
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(draft), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await generateLorebookDraft('Приморский городок');

    const requestBody = fetchMock.mock.calls[0]?.[1]?.body;
    expect(typeof requestBody).toBe('string');
    expect(JSON.parse(String(requestBody))).toMatchObject({
      entryCount: GenerateLorebookDraftCommandSchema.parse({ concept: 'Приморский городок' }).entryCount,
    });
  });
});
