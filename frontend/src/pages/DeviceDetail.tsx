import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react';
import { api, MAX_MEASUREMENTS } from '../api/endpoints';
import type { Device } from '../api/types';
import { deviceTypeLabel, isPlausible, metricDef, metricsFor, powerSourceLabel } from '../config/catalog';
import { usePolling } from '../hooks/usePolling';
import { fmtDateTime, fmtNumber, fmtRelative } from '../lib/format';
import { autoAgg, presetRange, rangeQuery, refreshRange, type TimeRange } from '../lib/time';
import { toTimePoints } from '../lib/series';
import { Card, ErrorState, PageHeader, QueryState, Spinner } from '../components/ui';
import { SERIES, TimeSeriesChart } from '../components/charts';
import { TimeRangePicker } from '../components/TimeRangePicker';
import { EventList } from '../components/EventList';
import { BatteryBadge, hasData, OnlineBadge } from '../components/deviceBits';
import { PowerStripControl } from '../components/controls/PowerStripControl';
import { BulbControl } from '../components/controls/BulbControl';
import { PresenceSettings, VibrationSettings } from '../components/controls/SensorSettings';
import { ButtonActions, KeypadInfo, RemoteScenes } from '../components/controls/InputDevices';

/** Backend trzyma w last_state ostatni wpisany PIN (presented_value) — nie pokazujemy go w panelu. */
const HIDDEN_STATE_KEYS = new Set(['presented_value']);

function formatStateValue(d: Device, key: string, v: unknown) {
  const def = metricDef(d.typ, key);
  if (def && typeof v === 'number') {
    const ok = isPlausible(def, v);
    return (
      <span className={ok ? '' : 'err-text'}>
        {fmtNumber(v, def.decimals)} {def.unit}
        {!ok && (
          <>
            {' '}
            <AlertTriangle size={13} /> błędny pomiar
          </>
        )}
      </span>
    );
  }
  if (v === null || v === undefined) return <span className="muted">—</span>;
  if (typeof v === 'boolean') return v ? 'tak' : 'nie';
  if (typeof v === 'object') return <span className="mono small">{JSON.stringify(v)}</span>;
  return String(v);
}

function DeviceControls({ device, onUpdate }: { device: Device; onUpdate: (d: Device) => void }) {
  switch (device.typ) {
    case 'power_strip':
      return <PowerStripControl device={device} onUpdate={onUpdate} />;
    case 'rgb_bulb':
      return <BulbControl device={device} onUpdate={onUpdate} />;
    case 'vibration_sensor':
      return <VibrationSettings device={device} onUpdate={onUpdate} />;
    case 'occupancy_sensor':
      return <PresenceSettings device={device} onUpdate={onUpdate} />;
    case 'remote':
      return <RemoteScenes device={device} />;
    case 'button':
      return <ButtonActions device={device} />;
    case 'access_keypad':
      return (
        <>
          <KeypadInfo device={device} />
          <Link to="/access" className="link-btn">
            Kontrola dostępu <ArrowRight size={14} />
          </Link>
        </>
      );
    case 'heat_meter':
      return (
        <Link to="/heat-meter" className="link-btn">
          Pełny widok ciepłomierza <ArrowRight size={14} />
        </Link>
      );
    default:
      return <div className="muted">Urządzenie tylko raportuje pomiary.</div>;
  }
}

function DeviceHistory({ device }: { device: Device }) {
  const metrics = metricsFor(device.typ);
  const [metric, setMetric] = useState(metrics[0]?.key ?? '');
  const [range, setRange] = useState<TimeRange>(() => presetRange('24h'));
  const def = metrics.find((m) => m.key === metric);
  const q = usePolling(
    () => {
      const r = refreshRange(range);
      return api.measurements({ device_id: device.id, metric, ...rangeQuery(r), agg: autoAgg(r), limit: MAX_MEASUREMENTS });
    },
    30_000,
    [device.id, metric, range],
  );
  if (!metrics.length) return null;
  return (
    <Card
      title="Historia pomiarów"
      actions={
        <>
          <select value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Wielkość">
            {metrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <TimeRangePicker value={range} onChange={setRange} />
        </>
      }
    >
      <QueryState data={q.data} error={q.error} loading={q.loading} onRetry={q.reload} empty={(x) => x.length === 0}>
        {(ms) => {
          const { points, invalid } = toTimePoints(ms, [metric], (_m, v) => isPlausible(def, v));
          return (
            <>
              <TimeSeriesChart
                data={points}
                binary={def?.binary}
                from={range.from.getTime()}
                to={refreshRange(range).to.getTime()}
                series={[{ key: metric, label: def?.label ?? metric, color: SERIES[0], unit: def?.unit, decimals: def?.decimals }]}
              />
              {invalid > 0 && (
                <div className="inline-warn">
                  <AlertTriangle size={14} /> Pominięto {invalid} błędnych pomiarów (poza zakresem wiarygodności).
                </div>
              )}
            </>
          );
        }}
      </QueryState>
    </Card>
  );
}

export function DeviceDetailPage() {
  const { id = '' } = useParams();
  const dev = usePolling(() => api.device(id), 3000, [id]);
  const events = usePolling(() => api.events({ device_id: id, limit: 15 }), 5000, [id]);

  if (!dev.data) {
    return (
      <>
        <Link to="/devices" className="link-btn">
          <ArrowLeft size={14} /> Urządzenia
        </Link>
        {dev.error ? <ErrorState error={dev.error} onRetry={dev.reload} /> : <Spinner />}
      </>
    );
  }
  const d = dev.data;
  const stateEntries = Object.entries(d.last_state).filter(([k]) => !HIDDEN_STATE_KEYS.has(k));

  return (
    <>
      <Link to="/devices" className="link-btn back">
        <ArrowLeft size={14} /> Urządzenia
      </Link>
      <PageHeader
        title={d.nazwa}
        subtitle={
          <>
            <span className="mono">{d.id}</span> · {deviceTypeLabel(d.typ)}
          </>
        }
        actions={
          <>
            <OnlineBadge device={d} />
            <BatteryBadge device={d} />
          </>
        }
      />
      {dev.error && (
        <div className="inline-warn">
          <AlertTriangle size={14} /> Nie udało się odświeżyć stanu — wyświetlany jest ostatni znany stan.
        </div>
      )}

      <div className="grid-2">
        <Card title="Sterowanie i konfiguracja">
          <DeviceControls device={d} onUpdate={(x) => dev.setData(x)} />
        </Card>
        <Card
          title="Stan bieżący"
          subtitle={hasData(d) ? `Ostatni raport: ${fmtRelative(d.updated_at)} (${fmtDateTime(d.updated_at)})` : 'Urządzenie nie przesłało jeszcze danych'}
        >
          <dl className="state-list">
            <div className="state-row">
              <dt>Zasilanie</dt>
              <dd>{powerSourceLabel(d.typ)}</dd>
            </div>
            <div className="state-row">
              <dt>Temat MQTT</dt>
              <dd className="mono small">{d.mqtt_topic ?? '—'}</dd>
            </div>
            <div className="state-row">
              <dt>Adres IEEE</dt>
              <dd className="mono small">{d.ieee_address ?? '—'}</dd>
            </div>
            {stateEntries.map(([k, v]) => (
              <div key={k} className="state-row">
                <dt className="mono">{k}</dt>
                <dd>{formatStateValue(d, k, v)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <DeviceHistory device={d} />

      <Card title="Zdarzenia urządzenia">
        <QueryState data={events.data} error={events.error} loading={events.loading} empty={(x) => x.length === 0}>
          {(list) => <EventList events={list} />}
        </QueryState>
      </Card>
    </>
  );
}
