const MS_PER_DAY = 86_400_000;

function localMidnight(date: Date): number {
  return new Date(date.getTime()).setHours(0, 0, 0, 0);
}

export function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((localMidnight(to) - localMidnight(from)) / MS_PER_DAY);
}
