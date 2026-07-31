import { describe, expect, it } from 'vitest';

import { pluralRu } from './plural';

const CHAT_FORMS = ['чат', 'чата', 'чатов'] as const;

describe('pluralRu', () => {
  it('склоняет единственное число', () => {
    expect(pluralRu(1, CHAT_FORMS)).toBe('1 чат');
    expect(pluralRu(21, CHAT_FORMS)).toBe('21 чат');
    expect(pluralRu(101, CHAT_FORMS)).toBe('101 чат');
  });

  it('склоняет 2–4', () => {
    expect(pluralRu(2, CHAT_FORMS)).toBe('2 чата');
    expect(pluralRu(3, CHAT_FORMS)).toBe('3 чата');
    expect(pluralRu(22, CHAT_FORMS)).toBe('22 чата');
    expect(pluralRu(104, CHAT_FORMS)).toBe('104 чата');
  });

  it('склоняет 0, 5–9 и круглые десятки', () => {
    expect(pluralRu(0, CHAT_FORMS)).toBe('0 чатов');
    expect(pluralRu(5, CHAT_FORMS)).toBe('5 чатов');
    expect(pluralRu(9, CHAT_FORMS)).toBe('9 чатов');
    expect(pluralRu(20, CHAT_FORMS)).toBe('20 чатов');
    expect(pluralRu(25, CHAT_FORMS)).toBe('25 чатов');
    expect(pluralRu(100, CHAT_FORMS)).toBe('100 чатов');
  });

  it('обрабатывает исключение 11–14 в любом разряде сотен', () => {
    expect(pluralRu(11, CHAT_FORMS)).toBe('11 чатов');
    expect(pluralRu(12, CHAT_FORMS)).toBe('12 чатов');
    expect(pluralRu(14, CHAT_FORMS)).toBe('14 чатов');
    expect(pluralRu(111, CHAT_FORMS)).toBe('111 чатов');
    expect(pluralRu(212, CHAT_FORMS)).toBe('212 чатов');
    expect(pluralRu(1114, CHAT_FORMS)).toBe('1114 чатов');
  });

  it('работает с другими словарями', () => {
    expect(pluralRu(3, ['запись', 'записи', 'записей'])).toBe('3 записи');
    expect(pluralRu(41, ['строка', 'строки', 'строк'])).toBe('41 строка');
    expect(pluralRu(12, ['каталог', 'каталога', 'каталогов'])).toBe('12 каталогов');
  });
});
