import { describe, expect, it } from 'vitest';

import { formatRelative } from './format-relative';

const NOW = new Date(2026, 8, 25, 10, 0);

function localIso(year: number, month: number, day: number, hour: number, minute: number, second = 0): string {
  return new Date(year, month, day, hour, minute, second).toISOString();
}

describe('formatRelative', () => {
  it('23 Sep 11:00 seen on 25 Sep 10:00 is two days ago, not yesterday', () => {
    expect(formatRelative(localIso(2026, 8, 23, 11, 0), NOW)).toBe('2 д');
  });

  it('late yesterday is вчера', () => {
    expect(formatRelative(localIso(2026, 8, 24, 23, 30), NOW)).toBe('вчера');
    expect(formatRelative(localIso(2026, 8, 24, 0, 0), NOW)).toBe('вчера');
  });

  it('earlier today shows the time', () => {
    expect(formatRelative(localIso(2026, 8, 25, 0, 5), NOW)).toBe('00:05');
    expect(formatRelative(localIso(2026, 8, 25, 9, 0), NOW)).toBe('09:00');
  });

  it('the same day-of-month last month is a date, not a time', () => {
    expect(formatRelative(localIso(2026, 7, 25, 9, 0), NOW)).toBe('25 авг.');
  });

  it('a future timestamp is только что', () => {
    expect(formatRelative(localIso(2026, 8, 25, 10, 5), NOW)).toBe('только что');
    expect(formatRelative(localIso(2026, 9, 1, 0, 0), NOW)).toBe('только что');
  });

  it('anything under one minute old is только что', () => {
    expect(formatRelative(localIso(2026, 8, 25, 9, 59, 15), NOW)).toBe('только что');
  });

  it('under an hour counts whole minutes', () => {
    expect(formatRelative(localIso(2026, 8, 25, 9, 59), NOW)).toBe('1 мин');
    expect(formatRelative(localIso(2026, 8, 25, 9, 0, 1), NOW)).toBe('59 мин');
  });

  it('a minute-old timestamp from before midnight still counts minutes', () => {
    expect(formatRelative(localIso(2026, 8, 24, 23, 50), new Date(2026, 8, 25, 0, 10))).toBe('20 мин');
  });

  it('counts calendar days below a week and shows the date from the seventh day', () => {
    expect(formatRelative(localIso(2026, 8, 19, 23, 59), NOW)).toBe('6 д');
    expect(formatRelative(localIso(2026, 8, 18, 23, 59), NOW)).toBe('18 сент.');
  });

  it('a week across the spring DST switch is a date, not six days', () => {
    expect(formatRelative(localIso(2026, 2, 23, 10, 0), new Date(2026, 2, 30, 10, 0))).toBe('23 мар.');
  });

  it('an unparsable value is returned as is', () => {
    expect(formatRelative('вчера, около полудня', NOW)).toBe('вчера, около полудня');
    expect(formatRelative('2026-13-45T99:99:99Z', NOW)).toBe('2026-13-45T99:99:99Z');
  });

  it('a missing value is a dash', () => {
    expect(formatRelative(null, NOW)).toBe('—');
    expect(formatRelative('', NOW)).toBe('—');
  });
});
