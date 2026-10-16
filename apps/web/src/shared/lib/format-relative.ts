import { calendarDaysBetween } from './calendar-days-between';

const MS_PER_MINUTE = 60_000;

const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const shortDateFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' });

export function formatRelative(iso: string | null, now: Date = new Date()): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const diffMin = Math.floor((now.getTime() - date.getTime()) / MS_PER_MINUTE);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин`;
  const diffDays = calendarDaysBetween(date, now);
  if (diffDays === 0) return timeFormat.format(date);
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} д`;
  return shortDateFormat.format(date);
}
