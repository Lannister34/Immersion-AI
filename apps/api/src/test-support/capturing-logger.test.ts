import { describe, expect, it } from 'vitest';

import { createCapturingLogger } from './capturing-logger.js';

describe('createCapturingLogger', () => {
  it('captures every line as a JSON record with its level label', () => {
    const { lines, logger } = createCapturingLogger();

    logger.info({ code: 'book_not_found' }, 'Книга не найдена');
    logger.error('Сбой');

    expect(lines).toEqual([
      expect.objectContaining({ code: 'book_not_found', level: 'info', msg: 'Книга не найдена' }),
      expect.objectContaining({ level: 'error', msg: 'Сбой' }),
    ]);
  });

  it('resolves firstLine with a line already written', async () => {
    const { firstLine, logger } = createCapturingLogger();

    logger.warn('первая');
    logger.warn('вторая');

    await expect(firstLine((line) => line.level === 'warn')).resolves.toMatchObject({ msg: 'первая' });
  });

  it('resolves firstLine with the first matching line written after it was asked', async () => {
    const { firstLine, logger } = createCapturingLogger();
    const awaited = firstLine((line) => line.level === 'error');

    logger.info('мимо');
    logger.error('нужная');
    logger.error('поздняя');

    await expect(awaited).resolves.toMatchObject({ msg: 'нужная' });
  });
});
