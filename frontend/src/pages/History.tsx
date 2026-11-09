import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Download } from 'lucide-react';
import { api, MAX_MEASUREMENTS, MAX_ROWS } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { Device } from '../api/types';
import { DEVICE_IDS, EVENT_TYPES, eventTypeLabel, isPlausible, metricDef, metricsFor } from '../config/catalog';
import { usePolling } from '../hooks/usePolling';
import { useDevices } from '../hooks/useDevices';
import { useToast } from '../context/ToastContext';
import { downloadText, fileStamp, toCsv } from '../lib/download';
import { fmtDateTime, fmtNumber } from '../lib/format';
import { autoAgg, presetRange, rangeQuery, refreshRange, type TimeRange } from '../lib/time';
import { toTimePoints } from '../lib/series';
import { Card, EmptyState, PageHeader, Pagination, QueryState, Segmented } from '../components/ui';
import { SERIES, TimeSeriesChart } from '../components/charts';
import { TimeRangePicker } from '../components/TimeRangePicker';
import { EventList } from '../components/EventList';

const PAGE = 20;

function MeasurementsTab({ devices }: { devices: Device[] }) {
  const toast = useToast();
  const withMetrics = devices.filter((d) => metricsFor(d.typ).length > 0);
  const [deviceId, setDeviceId] = useState<string>(DEVICE_IDS.env);
  const device = withMetrics.find((d) => d.id === deviceId) ?? withMetrics[0];
  const metrics = device ? metricsFor(device.typ) : [];
  const [metricSel, setMetric] = useState('temperature');
  const metric = metrics.some((m) => m.key === metricSel) ? metricSel : (metrics[0]?.key ?? '');
  const def = device ? metricDef(device.typ, metric) : undefined;
  const [range, setRange] = useState<TimeRange>(() => presetRange('24h'));
  const [page, setPage] = useState(0);

  const agg = autoAgg(range);
  // Tabela zawsze na surowych pomiarach; wykres na nich lub na średnich (długi zakres).
  const raw = usePolling(
    () =>
      device
        ? api.measurements({ device_id: device.id, metric, ...rangeQuery(refreshRange(range)), limit: MAX_MEASUREMENTS })
        : Promise.resolve([]),
    30_000,
    [device?.id, metric, range],
  );
  const aggregated = usePolling(
    () =>
      device && agg !== 'raw'
        ? api.measurements({ device_id: device.id, metric, ...rangeQuery(refreshRange(range)), agg, limit: MAX_MEASUREMENTS })
        : Promise.resolve([]),
    30_000,
    [device?.id, metric, range, agg],
  );
  const chart = agg === 'raw' ? raw : aggregated;

  const rows = raw.data ?? [];
  const truncated = rows.length >= MAX_MEASUREMENTS;
  const valid = rows.filter((m) => isPlausible(def, m.value));
  const summary = valid.length
    ? {
        min: valid.reduce((a, m) => Math.min(a, m.value), Infinity),
        max: valid.reduce((a, m) => Math.max(a, m.value), -Infinity),
        avg: valid.reduce((a, m) => a + m.value, 0) / valid.length,
      }
    : null;

  async function exportCsv() {
    if (!device) return;
    try {
      const csv = await api.exportCsv({ dataset: 'measurements', device_id: device.id, ...rangeQuery(refreshRange(range)) });
      downloadText(`pomiary-${device.id}-${fileStamp()}.csv`, csv);
    } catch (e) {
      toast.error('Eksport nie powiódł się', errorMessage(e));
    }
  }

  if (!device) return <EmptyState>Brak urządzeń z pomiarami</EmptyState>;
  const pageCount = Math.ceil(rows.length / PAGE);
  const r = refreshRange(range);

  return (
    <>
      <div className="filters">
        <select
          value={device.id}
          onChange={(e) => {
            setDeviceId(e.target.value);
            setPage(0);
          }}
          aria-label="Urządzenie"
        >
          {withMetrics.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nazwa}
            </option>
          ))}
        </select>
        <select
          value={metric}
          onChange={(e) => {
            setMetric(e.target.value);
            setPage(0);
          }}
          aria-label="Wielkość"
        >
          {metrics.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <TimeRangePicker
          value={range}
          onChange={(x) => {
            setRange(x);
            setPage(0);
          }}
        />
        <button className="btn btn-sm" onClick={() => void exportCsv()} title="Eksportuje wszystkie wielkości tego urządzenia w wybranym zakresie">
          <Download size={14} /> Eksport CSV
        </button>
      </div>

      <Card
        title={`${def?.label ?? metric} — ${device.nazwa}`}
        subtitle={agg === 'raw' ? 'Surowe pomiary' : `Średnie ${agg === 'hour' ? 'godzinowe' : 'dobowe'} (automatycznie dla długiego zakresu)`}
      >
        <QueryState data={chart.data} error={chart.error} loading={chart.loading} onRetry={chart.reload} empty={(x) => x.length === 0}>
          {(ms) => {
            const { points, invalid } = toTimePoints(ms, [metric], (_m, v) => isPlausible(def, v));
            return (
              <>
                <TimeSeriesChart
                  data={points}
                  binary={def?.binary}
                  from={r.from.getTime()}
                  to={r.to.getTime()}
                  series={[{ key: metric, label: def?.label ?? metric, color: SERIES[0], unit: def?.unit, decimals: def?.decimals }]}
                />
                {invalid > 0 && (
                  <div className="inline-warn">
                    <AlertTriangle size={14} /> Na wykresie pominięto {invalid} błędnych pomiarów.
                  </div>
                )}
              </>
            );
          }}
        </QueryState>
        {truncated && (
          <div className="inline-warn">
            <AlertTriangle size={14} /> Pokazano {MAX_MEASUREMENTS} najnowszych pomiarów z zakresu — pełne dane są w eksporcie CSV.
          </div>
        )}
        {summary && !def?.binary && (
          <div className="mini-stats">
            <div>
              <span className="muted small">Minimum</span>
              <strong>
                {fmtNumber(summary.min, def?.decimals)} {def?.unit}
              </strong>
            </div>
            <div>
              <span className="muted small">Maksimum</span>
              <strong>
                {fmtNumber(summary.max, def?.decimals)} {def?.unit}
              </strong>
            </div>
            <div>
              <span className="muted small">Średnia</span>
              <strong>
                {fmtNumber(summary.avg, def?.decimals)} {def?.unit}
              </strong>
            </div>
            <div>
              <span className="muted small">Liczba pomiarów</span>
              <strong>{valid.length}</strong>
            </div>
          </div>
        )}
      </Card>

      <Card title="Tabela pomiarów">
        <QueryState data={raw.data} error={raw.error} loading={raw.loading} onRetry={raw.reload} empty={(x) => x.length === 0}>
          {() => (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Czas (lokalny)</th>
                      <th>Wielkość</th>
                      <th className="right">Wartość</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(page * PAGE, page * PAGE + PAGE).map((m, i) => {
                      const ok = isPlausible(def, m.value);
                      return (
                        <tr key={m.id ?? `${m.ts}-${i}`} className={ok ? '' : 'row-err'}>
                          <td>{fmtDateTime(m.ts)}</td>
                          <td className="mono small">{m.metric}</td>
                          <td className="right num">
                            {def?.binary ? (m.value ? 'tak' : 'nie') : `${fmtNumber(m.value, def?.decimals ?? 2)} ${m.unit}`}
                          </td>
                          <td>
                            {ok ? (
                              <span className="ok-text small">
                                <CheckCircle2 size={13} /> poprawny
                              </span>
                            ) : (
                              <span className="err-text small">
                                <AlertTriangle size={13} /> błędny pomiar
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={Math.min(page, Math.max(0, pageCount - 1))} pageCount={pageCount} onPage={setPage} total={rows.length} />
            </>
          )}
        </QueryState>
      </Card>
    </>
  );
}

function EventsTab({ devices }: { devices: Device[] }) {
  const toast = useToast();
  const [type, setType] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [range, setRange] = useState<TimeRange>(() => presetRange('24h'));
  const [page, setPage] = useState(0);
  const q = usePolling(
    () => api.events({ type, device_id: deviceId || undefined, ...rangeQuery(refreshRange(range)), limit: MAX_ROWS }),
    10_000,
    [type, deviceId, range],
  );
  const rows = q.data ?? [];

  async function exportCsv() {
    try {
      // Eksport backendu nie filtruje po typie — przy aktywnym filtrze CSV powstaje z pobranych wierszy.
      const csv = type
        ? toCsv(
            ['id', 'device_id', 'typ', 'payload', 'ts'],
            rows.map((e) => [e.id, e.device_id, e.typ, JSON.stringify(e.payload), e.ts]),
          )
        : await api.exportCsv({ dataset: 'events', device_id: deviceId || undefined, ...rangeQuery(refreshRange(range)) });
      downloadText(`zdarzenia-${fileStamp()}.csv`, csv);
    } catch (e) {
      toast.error('Eksport nie powiódł się', errorMessage(e));
    }
  }

  const pageCount = Math.ceil(rows.length / PAGE);
  const reset = () => setPage(0);

  return (
    <>
      <div className="filters">
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            reset();
          }}
          aria-label="Typ zdarzenia"
        >
          <option value="">Wszystkie typy</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {eventTypeLabel(t)}
            </option>
          ))}
        </select>
        <select
          value={deviceId}
          onChange={(e) => {
            setDeviceId(e.target.value);
            reset();
          }}
          aria-label="Urządzenie"
        >
          <option value="">Wszystkie urządzenia</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nazwa}
            </option>
          ))}
        </select>
        <TimeRangePicker
          value={range}
          onChange={(x) => {
            setRange(x);
            reset();
          }}
        />
        <button className="btn btn-sm" onClick={() => void exportCsv()}>
          <Download size={14} /> Eksport CSV
        </button>
      </div>
      <Card title="Zdarzenia">
        <QueryState data={q.data} error={q.error} loading={q.loading} onRetry={q.reload} empty={(x) => x.length === 0}>
          {() => (
            <>
              <EventList events={rows.slice(page * PAGE, page * PAGE + PAGE)} devices={devices} />
              <Pagination page={Math.min(page, Math.max(0, pageCount - 1))} pageCount={pageCount} onPage={setPage} total={rows.length} />
            </>
          )}
        </QueryState>
      </Card>
    </>
  );
}

/** F9 — historia pomiarów i zdarzeń z filtrowaniem po urządzeniu i zakresie czasu. */
export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'events' ? 'events' : 'measurements';
  const devices = useDevices(30_000);
  return (
    <>
      <PageHeader
        title="Historia"
        subtitle="Pomiary i zdarzenia z bazy — filtrowanie po urządzeniu i zakresie czasu, eksport CSV"
        actions={
          <Segmented
            value={tab}
            onChange={(v) => setParams(v === 'events' ? { tab: 'events' } : {})}
            label="Rodzaj danych"
            options={[
              { value: 'measurements', label: 'Pomiary' },
              { value: 'events', label: 'Zdarzenia' },
            ]}
          />
        }
      />
      <QueryState data={devices.data} error={devices.error} loading={devices.loading} onRetry={devices.reload}>
        {(list) => (tab === 'events' ? <EventsTab devices={list} /> : <MeasurementsTab devices={list} />)}
      </QueryState>
    </>
  );
}
