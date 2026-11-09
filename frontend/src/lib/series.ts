import type { Measurement, StatPoint } from '../api/types';
import type { TimePoint } from '../components/charts';

/**
 * Zamienia listę pomiarów (format API) na wiersze wykresu {t, metric1, metric2…}.
 * Pomiary poza zakresem wiarygodności są pomijane — na wykresie powstaje przerwa.
 */
export function toTimePoints(
  ms: Measurement[],
  keys: string[],
  isOk: (metric: string, v: number) => boolean = () => true,
): { points: TimePoint[]; invalid: number } {
  const map = new Map<number, TimePoint>();
  let invalid = 0;
  for (const m of ms) {
    if (!keys.includes(m.metric)) continue;
    const t = new Date(m.ts).getTime();
    const ok = isOk(m.metric, m.value);
    if (!ok) invalid++;
    let row = map.get(t);
    if (!row) {
      row = { t } as TimePoint;
      map.set(t, row);
    }
    row[m.metric] = ok ? m.value : null;
  }
  return { points: [...map.values()].sort((a, b) => a.t - b.t), invalid };
}

/**
 * Zużycie w okresie dla licznika narastającego: przyrost maks − min.
 * Nie korzystamy z daily_consumption, bo backend przy braku przyrostu zwraca tam
 * cały stan licznika (dzień bez zużycia wyglądałby jak ogromne zużycie).
 */
export function consumption(p: StatPoint) {
  return Math.max(0, p.max - p.min);
}

export function totalConsumption(series: StatPoint[]) {
  return series.reduce((a, p) => a + consumption(p), 0);
}
