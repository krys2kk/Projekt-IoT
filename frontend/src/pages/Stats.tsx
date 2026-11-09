import { useState, type ReactNode } from 'react';
import { Flame, Sigma, Zap } from 'lucide-react';
import { api } from '../api/endpoints';
import type { Stats } from '../api/types';
import { DEVICE_IDS, metricDef, metricsFor } from '../config/catalog';
import { usePolling } from '../hooks/usePolling';
import { useDevices } from '../hooks/useDevices';
import { fmtDate, fmtDateTimeShort, fmtDayLabel, fmtHM, fmtNumber } from '../lib/format';
import { periodToDate, presetRange, rangeQuery, refreshRange, utcDaysRange, type TimeRange } from '../lib/time';
import { consumption, totalConsumption } from '../lib/series';
import { Card, PageHeader, QueryState, Segmented, StatTile } from '../components/ui';
import { BarSeriesChart, SERIES } from '../components/charts';
import { TimeRangePicker } from '../components/TimeRangePicker';

function EnergyCard({ title, deviceId, color, icon, days }: { title: string; deviceId: string; color: string; icon: ReactNode; days: number }) {
  const q = usePolling(() => api.stats({ device_id: deviceId, metric: 'energy', period: 'day', ...utcDaysRange(days) }), 60_000, [deviceId, days]);
  return (
    <Card title={title} icon={icon}>
      <QueryState data={q.data} error={q.error} loading={q.loading} onRetry={q.reload} empty={(s) => s.series.length === 0}>
        {(s) => {
          const total = totalConsumption(s.series);
          const peak = s.series.reduce((a, b) => (consumption(b) > consumption(a) ? b : a), s.series[0]);
          return (
            <>
              <div className="mini-stats">
                <div>
                  <span className="muted small">Suma</span>
                  <strong>{fmtNumber(total, 2)} kWh</strong>
                </div>
                <div>
                  <span className="muted small">Średnio na dobę</span>
                  <strong>{fmtNumber(total / Math.max(1, s.series.length), 2)} kWh</strong>
                </div>
                <div>
                  <span className="muted small">Najwyższe zużycie</span>
                  <strong>
                    {fmtNumber(consumption(peak), 2)} kWh · {fmtDayLabel(periodToDate(peak.period))}
                  </strong>
                </div>
              </div>
              <BarSeriesChart
                data={s.series.map((b) => ({
                  key: b.period,
                  label: fmtDayLabel(periodToDate(b.period)),
                  energy: Math.round(consumption(b) * 1000) / 1000,
                }))}
                series={[{ key: 'energy', label: 'Zużycie', color, unit: 'kWh', decimals: 2 }]}
                tooltipTitle={(d) => fmtDate(periodToDate(String(d.key)))}
              />
            </>
          );
        }}
      </QueryState>
    </Card>
  );
}

function MetricStats() {
  const devices = useDevices(60_000);
  const [deviceId, setDeviceId] = useState<string>(DEVICE_IDS.env);
  const [metricSel, setMetric] = useState('temperature');
  const [period, setPeriod] = useState<'day' | 'hour'>('day');
  const [range, setRange] = useState<TimeRange>(() => presetRange('7d'));
  const list = (devices.data ?? []).filter((d) => metricsFor(d.typ).some((m) => !m.binary));
  const device = list.find((d) => d.id === deviceId) ?? list[0];
  const metrics = device ? metricsFor(device.typ).filter((m) => !m.binary) : [];
  const metric = metrics.some((m) => m.key === metricSel) ? metricSel : (metrics[0]?.key ?? '');
  const def = device ? metricDef(device.typ, metric) : undefined;

  const q = usePolling<Stats | undefined>(
    () => (device ? api.stats({ device_id: device.id, metric, period, ...rangeQuery(refreshRange(range)) }) : Promise.resolve(undefined)),
    60_000,
    [device?.id, metric, period, range],
  );
  const unit = def?.unit ?? '';
  const dec = def?.decimals ?? 1;
  const cumulative = !!def?.cumulative;
  const label = (p: string) => (period === 'day' ? fmtDayLabel(periodToDate(p)) : fmtHM(periodToDate(p)));
  const count = (s: Stats) => s.series.reduce((a, b) => a + b.count, 0);

  return (
    <Card
      title="Statystyki wielkości"
      icon={<Sigma size={16} />}
      subtitle="Minimum, maksimum, średnia i suma w okresach; doby wg czasu UTC"
      actions={
        <>
          <select value={device?.id ?? ''} onChange={(e) => setDeviceId(e.target.value)} aria-label="Urządzenie">
            {list.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nazwa}
              </option>
            ))}
          </select>
          <select value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Wielkość">
            {metrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <Segmented
            value={period}
            onChange={setPeriod}
            label="Okres agregacji"
            options={[
              { value: 'day', label: 'Doba' },
              { value: 'hour', label: 'Godzina' },
            ]}
          />
          <TimeRangePicker value={range} onChange={setRange} />
        </>
      }
    >
      <QueryState data={q.data} error={q.error} loading={q.loading || devices.loading} onRetry={q.reload} empty={(s) => !s || s.series.length === 0}>
        {(s) =>
          s && (
            <>
              <div className="stats-grid five">
                <StatTile label="Minimum" value={fmtNumber(s.overall_min, dec)} unit={unit} />
                <StatTile label="Maksimum" value={fmtNumber(s.overall_max, dec)} unit={unit} />
                <StatTile label="Średnia" value={fmtNumber(s.overall_avg, dec)} unit={unit} />
                {cumulative ? (
                  <StatTile label="Zużycie (przyrost)" value={fmtNumber(totalConsumption(s.series), 2)} unit={unit} />
                ) : (
                  <StatTile label="Suma" value={fmtNumber(s.overall_sum, dec)} unit={unit} sub="suma wartości pomiarów" />
                )}
                <StatTile label="Liczba pomiarów" value={count(s)} />
              </div>
              <BarSeriesChart
                data={s.series.map((b) => ({
                  key: b.period,
                  label: label(b.period),
                  value: Math.round((cumulative ? consumption(b) : b.avg) * 1000) / 1000,
                }))}
                series={[{ key: 'value', label: cumulative ? 'Zużycie' : 'Średnia', color: SERIES[0], unit, decimals: dec }]}
                tooltipTitle={(d) => (period === 'day' ? fmtDate(periodToDate(String(d.key))) : fmtDateTimeShort(periodToDate(String(d.key))))}
              />
              <div className="table-wrap">
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Okres</th>
                      <th className="right">Min</th>
                      <th className="right">Maks</th>
                      <th className="right">Średnia</th>
                      <th className="right">{cumulative ? 'Zużycie' : 'Suma'}</th>
                      <th className="right">Pomiarów</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...s.series].reverse().map((b) => (
                      <tr key={b.period}>
                        <td>{period === 'day' ? fmtDate(periodToDate(b.period)) : fmtDateTimeShort(periodToDate(b.period))}</td>
                        <td className="right num">{fmtNumber(b.min, dec)}</td>
                        <td className="right num">{fmtNumber(b.max, dec)}</td>
                        <td className="right num">{fmtNumber(b.avg, dec)}</td>
                        <td className="right num">{cumulative ? fmtNumber(consumption(b), 3) : fmtNumber(b.sum, dec)}</td>
                        <td className="right num">{b.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        }
      </QueryState>
    </Card>
  );
}

/** F10 — statystyki i agregacje: min/maks/średnia/suma; dobowe zużycie energii cieplnej i elektrycznej. */
export function StatsPage() {
  const [days, setDays] = useState<'7' | '14' | '30'>('14');
  return (
    <>
      <PageHeader
        title="Statystyki"
        subtitle="Agregacje liczone przez backend; doby wg czasu UTC"
        actions={
          <Segmented
            value={days}
            onChange={setDays}
            label="Liczba dni"
            options={[
              { value: '7', label: '7 dni' },
              { value: '14', label: '14 dni' },
              { value: '30', label: '30 dni' },
            ]}
          />
        }
      />
      <div className="grid-2">
        <EnergyCard title="Dobowe zużycie energii cieplnej" deviceId={DEVICE_IDS.heat} color={SERIES[1]} icon={<Flame size={16} />} days={Number(days)} />
        <EnergyCard title="Dobowe zużycie energii elektrycznej (listwa)" deviceId={DEVICE_IDS.strip} color={SERIES[0]} icon={<Zap size={16} />} days={Number(days)} />
      </div>
      <MetricStats />
    </>
  );
}
