import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Droplets, Flame, KeyRound, Lightbulb, Radar, Siren, Thermometer, Zap } from 'lucide-react';
import { api, MAX_MEASUREMENTS } from '../api/endpoints';
import type { Device } from '../api/types';
import { DEVICE_IDS, isBatteryPowered, isPlausible, metricDef } from '../config/catalog';
import { usePolling } from '../hooks/usePolling';
import { useDevices } from '../hooks/useDevices';
import { useDeviceCommand } from '../hooks/useDeviceCommand';
import { fmtNumber, fmtRelative, fmtTime } from '../lib/format';
import { presetRange, rangeQuery } from '../lib/time';
import { toTimePoints } from '../lib/series';
import { Card, PageHeader, QueryState, StatTile, Toggle } from '../components/ui';
import { TimeSeriesChart, SERIES } from '../components/charts';
import { EventList } from '../components/EventList';
import { AccessResultBadge, BatteryBadge, batteryOf, hasData } from '../components/deviceBits';
import { PowerStripControl } from '../components/controls/PowerStripControl';

function reading(d: Device | undefined, key: string) {
  if (!d) return { value: undefined as number | undefined, warn: 'brak urządzenia' };
  const v = d.last_state[key];
  const num = typeof v === 'number' ? v : undefined;
  if (!d.online) return { value: num, warn: hasData(d) ? `offline · ${fmtRelative(d.updated_at)}` : 'offline' };
  if (v === undefined) return { value: undefined, warn: 'brak danych' };
  if (!isPlausible(metricDef(d.typ, key), v)) return { value: undefined, warn: `błędny pomiar (${String(v)})` };
  return { value: num, warn: null };
}

function BulbQuick({ device, onUpdate }: { device: Device; onUpdate: (d: Device) => void }) {
  const { send, isPending } = useDeviceCommand(device, onUpdate);
  const on = device.last_state.state === 'ON';
  return (
    <div className={`socket ${on ? 'on' : ''}`}>
      <span className="socket-icon">
        <Lightbulb size={18} />
      </span>
      <div className="socket-text">
        <div className="socket-name">Żarówka RGB</div>
        {device.last_state.brightness !== undefined && (
          <div className="muted small">jasność {Math.round((Number(device.last_state.brightness) / 254) * 100)}%</div>
        )}
      </div>
      <span className={`socket-state ${on ? 'on' : ''}`}>
        {isPending('state') ? '…' : device.last_state.state === undefined ? '—' : on ? 'WŁ.' : 'WYŁ.'}
      </span>
      <Toggle
        checked={on}
        disabled={!device.online}
        pending={isPending('state')}
        onChange={(v) => void send({ state: v ? 'ON' : 'OFF' })}
        label="Żarówka"
      />
    </div>
  );
}

export function DashboardPage() {
  const devices = useDevices(4000);
  const events = usePolling(() => api.events({ limit: 8 }), 5000);
  const attempts = usePolling(() => api.accessAttempts({ limit: 6 }), 4000);
  const env = usePolling(() => {
    const r = presetRange('24h');
    return api.measurements({ device_id: DEVICE_IDS.env, metric: 'temperature', ...rangeQuery(r), limit: MAX_MEASUREMENTS });
  }, 60_000);

  const d = devices.byId;
  const envDev = d(DEVICE_IDS.env);
  const temp = reading(envDev, 'temperature');
  const hum = reading(envDev, 'humidity');
  const pres = d(DEVICE_IDS.occupancy);
  const vib = d(DEVICE_IDS.vibration);
  const strip = d(DEVICE_IDS.strip);
  const heat = d(DEVICE_IDS.heat);
  const bulb = d(DEVICE_IDS.bulb);
  const heatPower = reading(heat, 'power');
  const stripPower = reading(strip, 'power');
  const alarm = vib?.last_state.alarm_status === 'alarm';
  const occupied = Boolean(pres?.last_state.occupancy);
  const tIn = Number(heat?.last_state.temperature_1);
  const tOut = Number(heat?.last_state.temperature_2);

  const list = devices.data ?? [];
  const online = list.filter((x) => x.online).length;
  const offline = list.filter((x) => !x.online);
  const lowBattery = list.filter((x) => isBatteryPowered(x.typ) && (batteryOf(x) ?? 100) < 25);

  return (
    <>
      <PageHeader
        title="Pulpit"
        subtitle={
          devices.updatedAt
            ? `Bieżące warunki w pomieszczeniu · aktualizacja ${fmtTime(devices.updatedAt)}`
            : 'Bieżące warunki w pomieszczeniu'
        }
      />

      <QueryState data={devices.data} error={devices.error} loading={devices.loading} onRetry={devices.reload}>
        {() => (
          <>
            <div className="stats-grid">
              <StatTile
                label="Temperatura"
                icon={<Thermometer size={16} />}
                value={fmtNumber(temp.value, 1)}
                unit="°C"
                warn={temp.warn}
                sub={envDev && hasData(envDev) ? `raport ${fmtRelative(envDev.updated_at)}` : undefined}
              />
              <StatTile label="Wilgotność" icon={<Droplets size={16} />} value={fmtNumber(hum.value, 1)} unit="%" warn={hum.warn} />
              <StatTile
                label="Obecność"
                icon={<Radar size={16} />}
                value={pres?.last_state.occupancy === undefined ? '—' : occupied ? 'Wykryto' : 'Brak'}
                tone={occupied ? 'info' : undefined}
                warn={pres && !pres.online ? 'offline' : pres?.last_state.occupancy === undefined ? 'brak danych' : null}
                sub={pres?.last_state.illumination !== undefined ? (pres.last_state.illumination === 'bright' ? 'jasno' : 'ciemno') : undefined}
              />
              <StatTile
                label="Wibracje"
                icon={<Siren size={16} />}
                value={vib?.last_state.alarm_status === undefined ? '—' : alarm ? 'ALARM' : 'Normalny'}
                tone={vib?.last_state.alarm_status === undefined ? undefined : alarm ? 'err' : 'ok'}
                warn={vib && !vib.online ? 'offline' : vib?.last_state.alarm_status === undefined ? 'brak danych' : null}
              />
              <StatTile
                label="Moc listwy"
                icon={<Zap size={16} />}
                value={fmtNumber(stripPower.value, 0)}
                unit="W"
                warn={stripPower.warn}
                sub={strip?.last_state.energy !== undefined ? `Licznik ${fmtNumber(strip.last_state.energy, 2)} kWh` : undefined}
              />
              <StatTile
                label="Moc cieplna"
                icon={<Flame size={16} />}
                value={fmtNumber(heatPower.value, 0)}
                unit="W"
                warn={heatPower.warn}
                sub={Number.isFinite(tIn - tOut) ? `ΔT ${fmtNumber(tIn - tOut, 1)} K · ${fmtNumber(heat?.last_state.flow, 2)} l/min` : undefined}
              />
            </div>

            <div className="grid-2">
              <Card
                title="Temperatura — ostatnie 24 h"
                actions={
                  <Link to="/history" className="link-btn">
                    Historia <ArrowRight size={14} />
                  </Link>
                }
              >
                <QueryState data={env.data} error={env.error} loading={env.loading} empty={(x) => x.length === 0}>
                  {(ms) => {
                    const def = metricDef('env_sensor', 'temperature');
                    const { points } = toTimePoints(ms, ['temperature'], (_m, v) => isPlausible(def, v));
                    return (
                      <TimeSeriesChart
                        data={points}
                        height={220}
                        series={[{ key: 'temperature', label: 'Temperatura', color: SERIES[0], unit: '°C' }]}
                      />
                    );
                  }}
                </QueryState>
              </Card>

              <Card
                title="Szybkie sterowanie"
                actions={
                  <Link to="/control" className="link-btn">
                    Sterowanie <ArrowRight size={14} />
                  </Link>
                }
              >
                {strip && <PowerStripControl device={strip} onUpdate={devices.update} compact />}
                {bulb && (
                  <div className="sockets" style={{ marginTop: 8 }}>
                    <BulbQuick device={bulb} onUpdate={devices.update} />
                  </div>
                )}
              </Card>
            </div>

            <div className="grid-3">
              <Card
                title="Ostatnie próby dostępu"
                icon={<KeyRound size={16} />}
                actions={
                  <Link to="/access" className="link-btn">
                    Wszystkie <ArrowRight size={14} />
                  </Link>
                }
              >
                <QueryState data={attempts.data} error={attempts.error} loading={attempts.loading} empty={(x) => x.length === 0}>
                  {(rows) => (
                    <ul className="simple-list">
                      {rows.map((a) => (
                        <li key={a.id}>
                          <AccessResultBadge result={a.wynik} />
                          <span className="grow">{a.user_login ?? <span className="muted">nieznany kod</span>}</span>
                          <span className="muted small">{fmtRelative(a.ts)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </QueryState>
              </Card>

              <Card
                title="Ostatnie zdarzenia"
                icon={<Activity size={16} />}
                actions={
                  <Link to="/history?tab=events" className="link-btn">
                    Wszystkie <ArrowRight size={14} />
                  </Link>
                }
              >
                <QueryState data={events.data} error={events.error} loading={events.loading} empty={(x) => x.length === 0}>
                  {(rows) => <EventList events={rows} devices={devices.data} compact />}
                </QueryState>
              </Card>

              <Card
                title="Stan sieci ZigBee"
                actions={
                  <Link to="/devices" className="link-btn">
                    Urządzenia <ArrowRight size={14} />
                  </Link>
                }
              >
                <div className="net-summary">
                  <div className="net-big">
                    {online}
                    <span className="muted">/{list.length}</span>
                  </div>
                  <div className="muted">urządzeń online</div>
                </div>
                {offline.length > 0 && (
                  <div className="net-group">
                    <div className="sub-head err-text">Offline</div>
                    {offline.map((x) => (
                      <Link key={x.id} to={`/devices/${x.id}`} className="net-item">
                        {x.nazwa}
                      </Link>
                    ))}
                  </div>
                )}
                {lowBattery.length > 0 && (
                  <div className="net-group">
                    <div className="sub-head">Niski poziom baterii</div>
                    {lowBattery.map((x) => (
                      <div key={x.id} className="net-item">
                        {x.nazwa} <BatteryBadge device={x} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
