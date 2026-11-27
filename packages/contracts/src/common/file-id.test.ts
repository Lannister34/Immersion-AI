import { describe, expect, it } from 'vitest';

import { createFileIdSchema } from './file-id.js';

describe('createFileIdSchema', () => {
  const schema = createFileIdSchema('Scenario id');

  it('accepts a name with inner double dots, which earlier files such as Mr..json carry', () => {
    expect(schema.parse('Mr..json')).toBe('Mr..json');
  });

  it('rejects a name the plain file name rule rejects, naming the id in its message', () => {
    const result = schema.safeParse('evil.json.');

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Scenario id must be a plain file name without path separators.');
  });
});
