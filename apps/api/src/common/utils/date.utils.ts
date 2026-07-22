import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { differenceInCalendarDays, startOfDay } from 'date-fns';

/** Display YYYY-MM-DD as day month year (e.g. 19 July 2026). */
export function formatDisplayDate(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Parse YYYY-MM-DD as UTC midnight so DB date comparisons stay consistent. */
export function parseDateOnly(dateISO: string): Date {
  return new Date(`${dateISO}T00:00:00.000Z`);
}

export function getFarmToday(timezone: string): Date {
  const now = new Date();
  const zonedNow = toZonedTime(now, timezone);
  const dateStr = formatInTimeZone(zonedNow, timezone, 'yyyy-MM-dd');
  return parseDateOnly(dateStr);
}

export function formatFarmDate(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, 'yyyy-MM-dd');
}

export function calculateDoc(stockingDate: Date, feedingDate: Date): number {
  const [sy, sm, sd] = stockingDate.toISOString().split('T')[0].split('-').map(Number);
  const [fy, fm, fd] = feedingDate.toISOString().split('T')[0].split('-').map(Number);
  const stockUtc = Date.UTC(sy, sm - 1, sd);
  const feedUtc = Date.UTC(fy, fm - 1, fd);
  const days = Math.floor((feedUtc - stockUtc) / 86_400_000);
  return Math.max(days + 1, 1);
}

export function isDateEditableBySupervisor(
  feedingDate: Date,
  farmTimezone: string,
): boolean {
  const today = getFarmToday(farmTimezone);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const feedDay = startOfDay(feedingDate);
  const todayStart = startOfDay(today);
  const yesterdayStart = startOfDay(yesterday);

  return (
    feedDay.getTime() === todayStart.getTime() ||
    feedDay.getTime() === yesterdayStart.getTime()
  );
}

export function isLateOfflineSubmission(
  feedingDate: Date,
  farmTimezone: string,
): boolean {
  return !isDateEditableBySupervisor(feedingDate, farmTimezone);
}

export function decimalToString(value: { toString(): string } | number | string): string {
  return typeof value === 'object' ? value.toString() : String(value);
}

export function sumDecimals(values: Array<{ toString(): string } | string | number>): string {
  let total = 0;
  for (const v of values) {
    total += parseFloat(String(v));
  }
  return total.toFixed(3);
}

export function getTransactionDirection(
  type: string,
): 'IN' | 'OUT' {
  const inTypes = [
    'OPENING_BALANCE',
    'FEED_RECEIVED',
    'MANUAL_ADJUSTMENT_IN',
    'REVERSAL',
  ];
  return inTypes.includes(type) ? 'IN' : 'OUT';
}
