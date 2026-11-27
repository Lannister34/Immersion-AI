import { describe, expect, it } from 'vitest';

import { createCapturingLogger } from '../../test-support/capturing-logger.js';
import { createListedFileNameFilter } from './listed-file-name-filter.js';

describe('createListedFileNameFilter', () => {
  it('keeps a plain file name without logging', () => {
    const logs = createCapturingLogger();
    const isListed = createListedFileNameFilter({ directory: 'shelf', logger: logs.logger });

    expect(isListed('Mr..json')).toBe(true);
    expect(isListed('Анонимный чат.json')).toBe(true);
    expect(logs.lines).toEqual([]);
  });

  it('skips a hidden or temporary file silently', () => {
    const logs = createCapturingLogger();
    const isListed = createListedFileNameFilter({ directory: 'shelf', logger: logs.logger });

    expect(isListed('.hidden.json')).toBe(false);
    expect(isListed('.Mr..json.1234.tmp')).toBe(false);
    expect(logs.lines).toEqual([]);
  });

  it('skips a foreign name and warns once per name however often it is listed', () => {
    const logs = createCapturingLogger();
    const isListed = createListedFileNameFilter({ directory: 'shelf', logger: logs.logger });
    const longName = `${'a'.repeat(200)}.json`;

    expect(isListed(longName)).toBe(false);
    expect(isListed(longName)).toBe(false);
    expect(isListed('evil.json ')).toBe(false);

    expect(logs.lines).toEqual([
      expect.objectContaining({ directory: 'shelf', fileName: longName, level: 'warn' }),
      expect.objectContaining({ directory: 'shelf', fileName: 'evil.json ', level: 'warn' }),
    ]);
  });

  it('checks the id a file would get, and names the file it skips', () => {
    const logs = createCapturingLogger();
    const isListed = createListedFileNameFilter({ directory: 'shelf', logger: logs.logger });
    const legacyImage = `${'a'.repeat(197)}.png`;

    expect(isListed('Ирис.png', 'Ирис.json')).toBe(true);
    expect(isListed(legacyImage, `${'a'.repeat(197)}.json`)).toBe(false);
    expect(logs.lines).toEqual([expect.objectContaining({ fileName: legacyImage, level: 'warn' })]);
  });
});
