// Formatowanie — dane przychodzą w UTC (ISO 8601), prezentujemy czas lokalny (pl-PL).

const dtFmt = new Intl.DateTimeFormat('pl-PL', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const dtShortFmt = new Intl.DateTimeFormat('pl-PL', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const dateFmt = new Intl.DateTimeFormat('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' });
const dayLabelFmt = new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: '2-digit', month: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const hmFmt = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' });

function toDate(v: string | number | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

export function fmtDateTime(v: string | number | Date | null | undefined) {
  if (v === null || v === undefined) return '—';
  const d = toDate(v);
  return Number.isNaN(d.getTime()) ? '—' : dtFmt.format(d);
}

export function fmtDateTimeShort(v: string | number | Date) {
  return dtShortFmt.format(toDate(v));
}

export function fmtDate(v: string | number | Date) {
  return dateFmt.format(toDate(v));
}

export function fmtDayLabel(v: string | number | Date) {
  return dayLabelFmt.format(toDate(v));
}

export function fmtTime(v: string | number | Date) {
  return timeFmt.format(toDate(v));
}

export function fmtHM(v: string | number | Date) {
  return hmFmt.format(toDate(v));
}

export function fmtNumber(v: unknown, decimals = 1): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtValue(v: unknown, unit: string, decimals = 1): string {
  const n = fmtNumber(v, decimals);
  if (n === '—') return n;
  return unit ? `${n} ${unit}` : n;
}

const rtf = new Intl.RelativeTimeFormat('pl-PL', { numeric: 'auto' });

export function fmtRelative(v: string | number | Date | null | undefined): string {
  if (v === null || v === undefined) return 'nigdy';
  const diffSec = (toDate(v).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diffSec);
  if (abs < 10) return 'przed chwilą';
  if (abs < 60) return rtf.format(Math.round(diffSec), 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  return rtf.format(Math.round(diffSec / 86400), 'day');
}

export function fmtDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return '—';
  if (hours < 48) return `${fmtNumber(hours, 1)} h`;
  const days = hours / 24;
  if (days < 120) return `${fmtNumber(days, 1)} dni`;
  return `${fmtNumber(days / 30.44, 1)} mies.`;
}
