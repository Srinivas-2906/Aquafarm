import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
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

export function toKg(value: string, unit: QuantityUnit): string {
  const n = parseFloat(value);
  if (!n || n <= 0) return value;
  if (unit === 'ton') return (n * 1000).toFixed(3).replace(/\.?0+$/, '');
  return value;
}

export function formatShortDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
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

export function isSupervisorEditableDate(dateISO: string): boolean {
  return dateISO === getTodayISO() || dateISO === getYesterdayISO();
}

export function calculateDoc(stockingDate: string, feedingDate: string): number {
  const stock = new Date(stockingDate);
  const feed = new Date(feedingDate);
  const diff = Math.floor((feed.getTime() - stock.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(diff + 1, 1);
}
