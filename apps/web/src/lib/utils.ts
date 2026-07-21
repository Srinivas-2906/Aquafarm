import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

function parseLocalDate(date: string | Date): Date {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return typeof date === 'string' ? new Date(date) : date;
}

export function formatDate(date: string | Date): string {
  const d = parseLocalDate(date);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function sumKg(values: string[]): string {
  const total = values.reduce((s, v) => s + (parseFloat(v) || 0), 0);
  return total.toFixed(1);
}

export function getTodayISO(): string {
  return toLocalDateISO(new Date());
}

export function getYesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalDateISO(d);
}

export function toLocalDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toLocalDateISO(date);
}

export type QuantityUnit = 'kg' | 'ton';

export function quantityToKg(value: string, unit: QuantityUnit): number {
  const n = parseFloat(value);
  if (!value.trim() || Number.isNaN(n) || n <= 0) return 0;
  return unit === 'ton' ? n * 1000 : n;
}

export function convertQuantityUnit(
  value: string,
  from: QuantityUnit,
  to: QuantityUnit,
): string {
  if (!value.trim() || from === to) return value;
  const kg = quantityToKg(value, from);
  if (kg <= 0) return value;
  if (to === 'kg') {
    if (Number.isInteger(kg)) return String(kg);
    return kg.toFixed(3).replace(/\.?0+$/, '');
  }
  const ton = kg / 1000;
  return ton.toFixed(3).replace(/\.?0+$/, '');
}

export function formatFeedQtyKg(value: string, unit: QuantityUnit = 'kg'): string {
  const kg = quantityToKg(value, unit);
  if (kg <= 0) return '';
  if (Number.isInteger(kg)) return String(kg);
  return kg.toFixed(3).replace(/\.?0+$/, '');
}

export function toKg(value: string, unit: QuantityUnit): string {
  return formatFeedQtyKg(value, unit);
}

export function formatShortDate(date: string | Date): string {
  const d = parseLocalDate(date);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'numeric', year: '2-digit' });
}

export function formatCurrentTime(): string {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatQty(kg: string | number, unit: QuantityUnit = 'kg'): string {
  const n = typeof kg === 'string' ? parseFloat(kg) : kg;
  if (!n || isNaN(n)) return unit === 'ton' ? '0 ton' : '0 kg';
  if (unit === 'ton' && n >= 1000) return `${(n / 1000).toFixed(2)} ton`;
  return `${n.toFixed(1)} kg`;
}

export function getDefaultMealTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function to24HourTime(hour12: string, minute: string, ampm: 'AM' | 'PM'): string {
  let hour = parseInt(hour12, 10);
  if (Number.isNaN(hour) || hour < 1 || hour > 12) hour = 12;
  const min = minute.padStart(2, '0').slice(0, 2);
  if (ampm === 'AM') {
    if (hour === 12) return `00:${min}`;
    return `${String(hour).padStart(2, '0')}:${min}`;
  }
  if (hour === 12) return `12:${min}`;
  return `${String(hour + 12).padStart(2, '0')}:${min}`;
}

export function from24HourTime(time24: string): { hour: string; minute: string; ampm: 'AM' | 'PM' } {
  const [hStr = '12', mStr = '00'] = time24.split(':');
  let hour = parseInt(hStr, 10);
  const ampm: 'AM' | 'PM' = hour >= 12 ? 'PM' : 'AM';
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;
  return { hour: String(hour), minute: mStr.padStart(2, '0'), ampm };
}

export function formatFeedQty(value: string): string {
  const n = parseFloat(value);
  if (!n || n <= 0) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, '');
}

export function isSupervisorEditableDate(dateISO: string): boolean {
  return dateISO === getTodayISO() || dateISO === getYesterdayISO();
}

export function calculateDoc(stockingDate: string, feedingDate: string): number {
  const [sy, sm, sd] = stockingDate.split('T')[0].split('-').map(Number);
  const [fy, fm, fd] = feedingDate.split('T')[0].split('-').map(Number);
  const stockUtc = Date.UTC(sy, sm - 1, sd);
  const feedUtc = Date.UTC(fy, fm - 1, fd);
  const days = Math.floor((feedUtc - stockUtc) / 86_400_000);
  return Math.max(days + 1, 1);
}
