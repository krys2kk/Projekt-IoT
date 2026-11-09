import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { fmtDateTime, fmtDayLabel, fmtHM, fmtNumber, fmtDateTimeShort } from '../lib/format';

// Kolory serii — tokeny CSS (--series-N) z walidowanej palety; jasny i ciemny motyw w styles.css.
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)'];

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
  unit?: string;
  decimals?: number;
}

export type TimePoint = { t: number } & Record<string, number | null>;

/** Etykieta osi: do 2 miejsc po przecinku, bez zbędnych zer (20,5 / 920 / 0,25). */
function fmtTick(v: number) {
  return v.toLocaleString('pl-PL', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 });
}

function Legend({ series }: { series: SeriesDef[] }) {
  if (series.length < 2) return null;
  return (
    <div className="chart-legend">
      {series.map((s) => (
        <span key={s.key} className="legend-item">
          <span className="legend-swatch" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function TimeTooltip({ active, payload, label, series }: TooltipProps<number, string> & { series: SeriesDef[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{fmtDateTime(Number(label))}</div>
      {series.map((s) => {
        const item = payload.find((p) => p.dataKey === s.key);
        if (!item || item.value === null || item.value === undefined) return null;
        return (
          <div key={s.key} className="chart-tip-row">
            <span className="legend-swatch" style={{ background: s.color }} />
            <span className="chart-tip-label">{s.label}</span>
            <span className="chart-tip-value">
              {fmtNumber(item.value, s.decimals ?? 1)} {s.unit}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TimeSeriesChart({
  data,
  series,
  height = 260,
  step,
  binary,
  from,
  to,
  referenceLines,
}: {
  data: TimePoint[];
  series: SeriesDef[];
  height?: number;
  step?: boolean;
  binary?: boolean;
  from?: number;
  to?: number;
  referenceLines?: { y: number; label: string }[];
}) {
  const xMin = from ?? (data.length ? data[0].t : Date.now() - 3600_000);
  const xMax = to ?? (data.length ? data[data.length - 1].t : Date.now());
  const span = xMax - xMin;
  const tickFmt = (v: number) => (span <= 36 * 3600_000 ? fmtHM(v) : span <= 8 * 86_400_000 ? fmtDateTimeShort(v) : fmtDayLabel(v));
  const unit = series[0]?.unit;
  return (
    <div className="chart">
      <Legend series={series} />
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[xMin, xMax]}
            tickFormatter={tickFmt}
            stroke="var(--axis)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            stroke="var(--axis)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={binary ? 60 : 52}
            domain={binary ? [0, 1] : ['auto', 'auto']}
            ticks={binary ? [0, 1] : undefined}
            tickFormatter={(v: number) => (binary ? (v === 1 ? 'tak' : 'nie') : fmtTick(v))}
            label={
              unit && !binary
                ? { value: unit, angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 12, dx: 4 }
                : undefined
            }
          />
          {referenceLines?.map((r) => (
            <ReferenceLine
              key={r.label}
              y={r.y}
              stroke="var(--text-muted)"
              strokeDasharray="4 4"
              label={{ value: r.label, fill: 'var(--text-muted)', fontSize: 11, position: 'insideTopRight' }}
            />
          ))}
          <Tooltip
            content={<TimeTooltip series={series} />}
            cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
            isAnimationActive={false}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type={step || binary ? 'stepAfter' : 'monotone'}
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={data.length <= 40 ? { r: 2.5, strokeWidth: 0, fill: s.color } : false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface BarDatum {
  key: string;
  label: string;
  [series: string]: number | string;
}

function BarTooltip({
  active,
  payload,
  series,
  title,
}: TooltipProps<number, string> & { series: SeriesDef[]; title?: (d: BarDatum) => ReactNode }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as BarDatum;
  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{title ? title(d) : d.label}</div>
      {series.map((s) => (
        <div key={s.key} className="chart-tip-row">
          <span className="legend-swatch" style={{ background: s.color }} />
          <span className="chart-tip-label">{s.label}</span>
          <span className="chart-tip-value">
            {fmtNumber(Number(d[s.key] ?? 0), s.decimals ?? 1)} {s.unit}
          </span>
        </div>
      ))}
    </div>
  );
}

export function BarSeriesChart({
  data,
  series,
  height = 240,
  stacked,
  tooltipTitle,
}: {
  data: BarDatum[];
  series: SeriesDef[];
  height?: number;
  stacked?: boolean;
  tooltipTitle?: (d: BarDatum) => ReactNode;
}) {
  return (
    <div className="chart">
      <Legend series={series} />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="var(--axis)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            interval="preserveStart"
            minTickGap={24}
          />
          <YAxis
            stroke="var(--axis)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={52}
            allowDecimals={!stacked}
            tickFormatter={(v: number) => (stacked ? fmtNumber(v, 0) : fmtTick(v))}
            label={
              series[0]?.unit
                ? { value: series[0].unit, angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 12, dx: 4 }
                : undefined
            }
          />
          <Tooltip
            content={<BarTooltip series={series} title={tooltipTitle} />}
            cursor={{ fill: 'var(--hover-wash)' }}
            isAnimationActive={false}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              fill={s.color}
              stackId={stacked ? 'a' : undefined}
              radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
              stroke="var(--surface)"
              strokeWidth={stacked ? 1 : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
