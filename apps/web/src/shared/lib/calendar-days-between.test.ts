import { describe, expect, it } from 'vitest';

import { calendarDaysBetween } from './calendar-days-between';

describe('calendarDaysBetween', () => {
  it('runs in the pinned Europe/Berlin zone, which observes DST', () => {
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Berlin');
  });

  it('is zero within one local day, from the first to the last millisecond', () => {
    expect(calendarDaysBetween(new Date(2026, 8, 25, 0, 0, 0, 0), new Date(2026, 8, 25, 23, 59, 59, 999))).toBe(0);
  });

  it('counts a midnight crossing as one day even when a minute apart', () => {
    expect(calendarDaysBetween(new Date(2026, 8, 24, 23, 59), new Date(2026, 8, 25, 0, 0))).toBe(1);
  });

  it('counts two days from 23 Sep 11:00 to 25 Sep 10:00, though under 48 hours apart', () => {
    expect(calendarDaysBetween(new Date(2026, 8, 23, 11, 0), new Date(2026, 8, 25, 10, 0))).toBe(2);
  });

  it('distinguishes the same day of the month in different months', () => {
    expect(calendarDaysBetween(new Date(2026, 7, 25, 9, 0), new Date(2026, 8, 25, 10, 0))).toBe(31);
  });

  it('crosses a year boundary', () => {
    expect(calendarDaysBetween(new Date(2026, 11, 31, 22, 0), new Date(2027, 0, 1, 1, 0))).toBe(1);
  });

  it('absorbs the 23-hour day of the spring DST switch', () => {
    expect(calendarDaysBetween(new Date(2026, 2, 29, 12, 0), new Date(2026, 2, 30, 12, 0))).toBe(1);
    expect(calendarDaysBetween(new Date(2026, 2, 23, 10, 0), new Date(2026, 2, 30, 10, 0))).toBe(7);
  });

  it('absorbs the 25-hour day of the autumn DST switch', () => {
    expect(calendarDaysBetween(new Date(2026, 9, 25, 12, 0), new Date(2026, 9, 26, 12, 0))).toBe(1);
    expect(calendarDaysBetween(new Date(2026, 9, 20, 10, 0), new Date(2026, 9, 27, 10, 0))).toBe(7);
  });

  it('keeps a year below 100 instead of mapping it into the 1900s', () => {
    expect(calendarDaysBetween(new Date('0099-12-31T12:00:00Z'), new Date('0100-01-01T12:00:00Z'))).toBe(1);
  });

  it('is negative when the second moment is on an earlier day', () => {
    expect(calendarDaysBetween(new Date(2026, 8, 25, 10, 0), new Date(2026, 8, 24, 10, 0))).toBe(-1);
  });
});
