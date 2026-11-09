import type { MeasurementAgg } from '../api/types';

export type RangePreset = '1h' | '6h' | '24h' | 'today' | '7d' | '30d' | 'custom';

export interface TimeRange {
  preset: RangePreset;
  from: Date;
  to: Date;
}

export const RANGE_PRESETS: { value: Exclude<RangePreset, 'custom'>; label: string }[] = [
  { value: '1h', label: 'Ostatnia godzina' },
  { value: '6h', label: 'Ostatnie 6 h' },
  { value: '24h', label: 'Ostatnie 24 h' },
  { value: 'today', label: 'Dziś' },
  { value: '7d', label: 'Ostatnie 7 dni' },
  { value: '30d', label: 'Ostatnie 30 dni' },
];

const H = 3600_000;
const DAY = 24 * H;

export function startOfLocalDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function presetRange(preset: Exclude<RangePreset, 'custom'>, now = new Date()): TimeRange {
  const to = now;
  switch (preset) {
    case '1h':
      return { preset, from: new Date(to.getTime() - H), to };
    case '6h':
      return { preset, from: new Date(to.getTime() - 6 * H), to };
    case '24h':
      return { preset, from: new Date(to.getTime() - DAY), to };
    case 'today':
      return { preset, from: startOfLocalDay(to), to };
    case '7d':
      return { preset, from: new Date(to.getTime() - 7 * DAY), to };
    case '30d':
      return { preset, from: new Date(to.getTime() - 30 * DAY), to };
  }
}

/** Odświeża zakres względny (np. „ostatnie 24 h”) do bieżącej chwili. */
export function refreshRange(r: TimeRange): TimeRange {
  return r.preset === 'custom' ? r : presetRange(r.preset);
}

/**
 * Format czasu dla backendu: taki sam jak w bazie („…:SSZ”, bez milisekund).
 * Backend filtruje po czasie przez porównanie tekstów, więc format musi się zgadzać.
 */
export function toApiTime(d: Date) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function rangeQuery(r: TimeRange) {
  return { from: toApiTime(r.from), to: toApiTime(r.to) };
}

/** Zakres ostatnich N pełnych dób UTC — backend grupuje statystyki dobowe wg UTC. */
export function utcDaysRange(days: number, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
  return { from: toApiTime(start), to: toApiTime(now) };
}

/** Automatyczny dobór agregacji, by wykres nie miał tysięcy punktów. */
export function autoAgg(r: TimeRange): MeasurementAgg {
  const span = r.to.getTime() - r.from.getTime();
  if (span <= 2 * DAY) return 'raw';
  if (span <= 60 * DAY) return 'hour';
  return 'day';
}

/** Wartość dla <input type="datetime-local"> w czasie lokalnym. */
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v); // interpretowane jako czas lokalny
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toLocalDateInput(d: Date) {
  return toLocalInput(d).slice(0, 10);
}

/** Etykiety okresów ze statystyk backendu: „2026-11-09” (doba UTC) lub „2026-11-09T12” (godzina UTC). */
export function periodToDate(period: string): Date {
  return new Date(period.length <= 10 ? `${period}T12:00:00Z` : `${period}:00:00Z`);
}
