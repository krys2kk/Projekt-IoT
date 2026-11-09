import { useMemo, useState, type ChangeEvent } from 'react';
import { BatteryCharging, Calculator, CheckCircle2, Droplets, Flame, Gauge, Thermometer, XCircle } from 'lucide-react';
import { api, MAX_MEASUREMENTS } from '../api/endpoints';
import type { Device } from '../api/types';
import { DEVICE_IDS, isPlausible, metricDef } from '../config/catalog';
import { usePolling } from '../hooks/usePolling';
import { fmtDayLabel, fmtDate, fmtDuration, fmtNumber, fmtRelative } from '../lib/format';
import { autoAgg, periodToDate, presetRange, rangeQuery, refreshRange, utcDaysRange, type TimeRange } from '../lib/time';
import { consumption, toTimePoints, totalConsumption } from '../lib/series';
import { Card, EmptyState, Field, PageHeader, QueryState, StatTile } from '../components/ui';
import { BarSeriesChart, SERIES, TimeSeriesChart } from '../components/charts';
import { TimeRangePicker } from '../components/TimeRangePicker';
import { hasData, OnlineBadge } from '../components/deviceBits';

const DEV = DEVICE_IDS.heat;
const CW = 4186; // J/(kg·K) — ciepło właściwe wody
const RHO = 1.0; // kg/l — przybliżenie gęstości wody

function val(d: Device | undefined, key: string) {
  const v = d?.last_state[key];
  return typeof v === 'number' && isPlausible(metricDef('heat_meter', key), v) ? v : undefined;
}

/** Scenariusz 7: moc z ciepłomierza vs obliczenie kontrolne Q̇ = ṁ · c_w · ΔT. */
function ControlCalculation({ d }: { d: Device }) {
  const tIn = val(d, 'temperature_1');
  const tOut = val(d, 'temperature_2');
  const flow = val(d, 'flow');
  const reported = val(d, 'power');
  if (!hasData(d)) return <EmptyState>Ciepłomierz nie przesłał jeszcze danych.</EmptyState>;
  if (tIn === undefined || tOut === undefined || flow === undefined || reported === undefined) {
    return (
      <div className="inline-warn">
        Brak kompletu poprawnych odczytów — obliczenie kontrolne niemożliwe (sprawdź czujniki DS18B20 i przepływomierz).
      </div>
    );
  }
  const dT = tIn - tOut;
  const mDot = (flow / 60) * RHO; // kg/s
  const q = mDot * CW * dT;
  const diff = q ? ((reported - q) / q) * 100 : 0;
  const ok = Math.abs(diff) <= 3;
  return (
    <div className="calc">
      <div className="calc-row">
        <span>
          ΔT = T<sub>zas</sub> − T<sub>pow</sub>
        </span>
        <span className="mono">
          {fmtNumber(tIn, 1)} − {fmtNumber(tOut, 1)} = <strong>{fmtNumber(dT, 1)} K</strong>
        </span>
      </div>
      <div className="calc-row">
        <span>ṁ = przepływ / 60 · ρ</span>
        <span className="mono">
          {fmtNumber(flow, 2)} / 60 · {RHO} = <strong>{fmtNumber(mDot, 4)} kg/s</strong>
        </span>
      </div>
      <div className="calc-row">
        <span>
          Q̇ = ṁ · c<sub>w</sub> · ΔT
        </span>
        <span className="mono">
          {fmtNumber(mDot, 4)} · {CW} · {fmtNumber(dT, 1)} = <strong>{fmtNumber(q, 0)} W</strong>
        </span>
      </div>
      <div className="calc-row">
        <span>Moc zgłoszona przez ciepłomierz</span>
        <span className="mono">
          <strong>{fmtNumber(reported, 0)} W</strong>
        </span>
      </div>
      <div className={`calc-result ${ok ? 'ok' : 'err'}`}>
        {ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
        Różnica {fmtNumber(diff, 1)}% — {ok ? 'zgodne z obliczeniem kontrolnym (tolerancja ±3%)' : 'rozbieżność powyżej ±3%'}
      </div>
    </div>
  );
}

// --- F15: szacowanie czasu pracy na baterii --------------------------------

type ParamKey = 'capacity' | 'efficiency' | 'iActive' | 'tActive' | 'iSleep' | 'tSleep' | 'iTx' | 'tTx' | 'reportEvery';
type Params = Record<ParamKey, string>;

// Wypełnione są tylko czasy cyklu z założeń (sekcja 7.3); prądy i pojemność wpisuje się z pomiarów.
const INITIAL: Params = {
  capacity: '',
  efficiency: '',
  iActive: '',
  tActive: '10',
  iSleep: '',
  tSleep: '60',
  iTx: '',
  tTx: '',
  reportEvery: '300',
};
const PARAMS_KEY = 'iot.heat.battery.v2';

function loadParams(): Params {
  try {
    const raw = localStorage.getItem(PARAMS_KEY);
    return raw ? { ...INITIAL, ...(JSON.parse(raw) as Partial<Params>) } : INITIAL;
  } catch {
    return INITIAL;
  }
}

function parseParams(p: Params) {
  const n = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v === '' ? NaN : Number(v)])) as Record<ParamKey, number>;
  return Object.values(n).every((v) => Number.isFinite(v) && v >= 0) && n.reportEvery > 0 && n.tActive + n.tSleep > 0 ? n : null;
}

type Parsed = Record<ParamKey, number>;

function avgCurrentMa(p: Parsed, tSleep = p.tSleep) {
  const measure = (p.iActive * p.tActive + (p.iSleep / 1000) * tSleep) / (p.tActive + tSleep);
  return measure + (p.iTx * p.tTx) / p.reportEvery;
}

function runtimeHours(p: Parsed, avgMa: number) {
  return avgMa > 0 ? (p.capacity * (p.efficiency / 100)) / avgMa : Infinity;
}

function BatteryEstimator({ battery }: { battery: { t: number; v: number }[] }) {
  const [p, setP] = useState<Params>(loadParams);
  const set = (k: ParamKey) => (e: ChangeEvent<HTMLInputElement>) => {
    const next = { ...p, [k]: e.target.value };
    setP(next);
    try {
      localStorage.setItem(PARAMS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const parsed = parseParams(p);

  // Szacunek z trendu: regresja liniowa poziomu baterii [%] w czasie
  const trend = useMemo(() => {
    if (battery.length < 3) return null;
    const sorted = [...battery].sort((a, b) => a.t - b.t);
    const t0 = sorted[0].t;
    const xs = sorted.map((b) => (b.t - t0) / 86_400_000);
    const ys = sorted.map((b) => b.v);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    const slope = den ? num / den : 0; // %/dzień
    const current = ys[ys.length - 1];
    return { slope, days: slope < 0 ? current / -slope : Infinity, current };
  }, [battery]);

  const sweep = useMemo(
    () =>
      parsed
        ? [15, 30, 60, 120, 180, 300, 600].map((ts) => ({
            key: String(ts),
            label: ts < 60 ? `${ts} s` : `${ts / 60} min`,
            days: Math.round((runtimeHours(parsed, avgCurrentMa(parsed, ts)) / 24) * 10) / 10,
          }))
        : [],
    [parsed],
  );

  const num = (k: ParamKey, label: string, unit: string, step = 1) => (
    <Field label={`${label} [${unit}]`}>
      <input type="number" min={0} step={step} value={p[k]} onChange={set(k)} />
    </Field>
  );

  const avg = parsed ? avgCurrentMa(parsed) : null;
  const noSleep = parsed ? runtimeHours(parsed, parsed.iActive + (parsed.iTx * parsed.tTx) / parsed.reportEvery) : null;
  const hours = parsed && avg !== null ? runtimeHours(parsed, avg) : null;

  return (
    <div className="grid-2">
      <div>
        <div className="sub-head">Parametry — wpisz wartości zmierzone</div>
        <div className="form-grid">
          {num('capacity', 'Pojemność ogniwa', 'mAh', 100)}
          {num('efficiency', 'Sprawność przetwornicy', '%')}
          {num('iActive', 'Prąd — okno pomiarowe', 'mA', 0.5)}
          {num('tActive', 'Czas okna pomiarowego', 's', 0.5)}
          {num('iSleep', 'Prąd — deep sleep', 'µA', 1)}
          {num('tSleep', 'Czas snu', 's', 5)}
          {num('iTx', 'Prąd — nadawanie ZigBee', 'mA', 1)}
          {num('tTx', 'Czas nadawania', 's', 0.1)}
          {num('reportEvery', 'Raport co', 's', 30)}
        </div>
      </div>
      <div className="stack">
        <div className="stats-grid two">
          <StatTile label="Średni pobór prądu" value={avg !== null ? fmtNumber(avg, 2) : '—'} unit="mA" />
          <StatTile label="Szacowany czas pracy" value={hours !== null ? fmtDuration(hours) : '—'} />
          <StatTile
            label="Bez deep sleep"
            value={noSleep !== null ? fmtDuration(noSleep) : '—'}
            sub={hours !== null && noSleep ? `zysk ×${fmtNumber(hours / noSleep, 1)}` : undefined}
          />
          <StatTile
            label="Z trendu baterii (30 dni)"
            value={trend && Number.isFinite(trend.days) ? fmtDuration(trend.days * 24) : '—'}
            sub={trend ? `spadek ${fmtNumber(-trend.slope, 2)} %/dzień, teraz ${trend.current}%` : 'za mało danych'}
          />
        </div>
        <div className="muted small">
          I<sub>śr</sub> = (I<sub>akt</sub>·t<sub>akt</sub> + I<sub>sen</sub>·t<sub>sen</sub>) / (t<sub>akt</sub> + t<sub>sen</sub>) + I
          <sub>TX</sub>·t<sub>TX</sub> / T<sub>raport</sub>; czas pracy = C · η / I<sub>śr</sub>
        </div>
        {!parsed && <div className="muted small">Uzupełnij wszystkie parametry, aby zobaczyć wynik.</div>}
        {sweep.length > 0 && (
          <div>
            <div className="sub-head">Czas pracy w zależności od długości snu</div>
            <BarSeriesChart
              height={190}
              data={sweep}
              series={[{ key: 'days', label: 'Czas pracy', color: SERIES[0], unit: 'dni', decimals: 1 }]}
              tooltipTitle={(d) => `Sen ${d.label}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const CHART_METRICS = ['temperature_1', 'temperature_2', 'power', 'flow'];

export function HeatMeterPage() {
  const dev = usePolling(() => api.device(DEV), 5000);
  const [range, setRange] = useState<TimeRange>(() => presetRange('24h'));
  const hist = usePolling(
    async () => {
      const r = refreshRange(range);
      // Osobno dla każdej wielkości, żeby limit wierszy dotyczył jednego przebiegu.
      const parts = await Promise.all(
        CHART_METRICS.map((metric) => api.measurements({ device_id: DEV, metric, ...rangeQuery(r), agg: autoAgg(r), limit: MAX_MEASUREMENTS })),
      );
      return parts.flat();
    },
    30_000,
    [range],
  );
  const daily = usePolling(() => api.stats({ device_id: DEV, metric: 'energy', period: 'day', ...utcDaysRange(14) }), 60_000);
  const battery = usePolling(
    () => api.measurements({ device_id: DEV, metric: 'battery', ...rangeQuery(presetRange('30d')), limit: MAX_MEASUREMENTS }),
    null,
  );
  const voltage = usePolling(
    () => api.measurements({ device_id: DEV, metric: 'voltage', ...rangeQuery(presetRange('30d')), limit: MAX_MEASUREMENTS }),
    null,
  );

  const d = dev.data;
  const tIn = val(d, 'temperature_1');
  const tOut = val(d, 'temperature_2');
  const invalid = (k: string) =>
    d && typeof d.last_state[k] === 'number' && !isPlausible(metricDef('heat_meter', k), d.last_state[k])
      ? `błędny pomiar (${String(d.last_state[k])})`
      : null;

  return (
    <>
      <PageHeader
        title="Ciepłomierz"
        subtitle="Moduł własny ESP32-C6: 2× DS18B20 (zasilanie / powrót) + turbinowy przepływomierz, zasilanie bateryjne (Sleepy End Device)"
        actions={d && <OnlineBadge device={d} />}
      />
      <QueryState data={dev.data} error={dev.error} loading={dev.loading} onRetry={dev.reload}>
        {(d) => (
          <>
            <div className="stats-grid">
              <StatTile label="Temp. zasilania" icon={<Thermometer size={16} />} value={fmtNumber(tIn, 1)} unit="°C" warn={invalid('temperature_1')} />
              <StatTile label="Temp. powrotu" icon={<Thermometer size={16} />} value={fmtNumber(tOut, 1)} unit="°C" warn={invalid('temperature_2')} />
              <StatTile
                label="ΔT"
                icon={<Gauge size={16} />}
                value={tIn !== undefined && tOut !== undefined ? fmtNumber(tIn - tOut, 1) : '—'}
                unit="K"
              />
              <StatTile label="Przepływ" icon={<Droplets size={16} />} value={fmtNumber(val(d, 'flow'), 2)} unit="l/min" warn={invalid('flow')} />
              <StatTile label="Moc cieplna" icon={<Flame size={16} />} value={fmtNumber(val(d, 'power'), 0)} unit="W" warn={invalid('power')} />
              <StatTile
                label="Energia (licznik)"
                icon={<Flame size={16} />}
                value={fmtNumber(val(d, 'energy'), 2)}
                unit="kWh"
                sub={hasData(d) ? `raport ${fmtRelative(d.updated_at)}` : undefined}
              />
              <StatTile
                label="Bateria"
                icon={<BatteryCharging size={16} />}
                value={fmtNumber(d.last_state.battery, 0)}
                unit="%"
                tone={typeof d.last_state.battery === 'number' && d.last_state.battery < 20 ? 'err' : undefined}
                sub={typeof d.last_state.voltage === 'number' ? `${fmtNumber(d.last_state.voltage, 0)} mV` : undefined}
              />
            </div>

            <div className="grid-2">
              <Card title="Obliczenie kontrolne mocy" icon={<Calculator size={16} />} subtitle="Q̇ [W] = ṁ [kg/s] · c_w [J/(kg·K)] · ΔT [K]">
                <ControlCalculation d={d} />
              </Card>
              <Card title="Dobowe zużycie energii cieplnej — 14 dni" icon={<Flame size={16} />} subtitle="Doby wg czasu UTC">
                <QueryState data={daily.data} error={daily.error} loading={daily.loading} onRetry={daily.reload} empty={(s) => s.series.length === 0}>
                  {(s) => {
                    const total = totalConsumption(s.series);
                    return (
                      <>
                        <BarSeriesChart
                          height={220}
                          data={s.series.map((b) => ({
                            key: b.period,
                            label: fmtDayLabel(periodToDate(b.period)),
                            energy: Math.round(consumption(b) * 1000) / 1000,
                          }))}
                          series={[{ key: 'energy', label: 'Energia cieplna', color: SERIES[1], unit: 'kWh', decimals: 2 }]}
                          tooltipTitle={(x) => fmtDate(periodToDate(String(x.key)))}
                        />
                        <div className="muted small">
                          Suma: <strong>{fmtNumber(total, 2)} kWh</strong> · średnio {fmtNumber(total / Math.max(1, s.series.length), 2)} kWh/dobę
                        </div>
                      </>
                    );
                  }}
                </QueryState>
              </Card>
            </div>
          </>
        )}
      </QueryState>

      <Card title="Przebiegi pomiarów" actions={<TimeRangePicker value={range} onChange={setRange} />}>
        <QueryState data={hist.data} error={hist.error} loading={hist.loading} onRetry={hist.reload} empty={(x) => x.length === 0}>
          {(ms) => {
            const isOk = (m: string, v: number) => isPlausible(metricDef('heat_meter', m), v);
            const temps = toTimePoints(ms, ['temperature_1', 'temperature_2'], isOk);
            const pw = toTimePoints(ms, ['power'], isOk);
            const fl = toTimePoints(ms, ['flow'], isOk);
            const r = refreshRange(range);
            const x = { from: r.from.getTime(), to: r.to.getTime() };
            return (
              <>
                <div className="sub-head">Temperatury zasilania i powrotu</div>
                <TimeSeriesChart
                  {...x}
                  data={temps.points}
                  series={[
                    { key: 'temperature_2', label: 'Powrót', color: SERIES[0], unit: '°C' },
                    { key: 'temperature_1', label: 'Zasilanie', color: SERIES[1], unit: '°C' },
                  ]}
                />
                {temps.invalid > 0 && <div className="inline-warn">Pominięto {temps.invalid} błędnych odczytów temperatury (np. −127 °C z DS18B20).</div>}
                <div className="grid-2 tight">
                  <div>
                    <div className="sub-head">Moc cieplna</div>
                    <TimeSeriesChart {...x} height={200} data={pw.points} series={[{ key: 'power', label: 'Moc', color: SERIES[1], unit: 'W', decimals: 0 }]} />
                  </div>
                  <div>
                    <div className="sub-head">Przepływ</div>
                    <TimeSeriesChart {...x} height={200} data={fl.points} series={[{ key: 'flow', label: 'Przepływ', color: SERIES[0], unit: 'l/min', decimals: 2 }]} />
                  </div>
                </div>
              </>
            );
          }}
        </QueryState>
      </Card>

      <Card title="Zasilanie bateryjne — pobór prądu i szacowany czas pracy (F15)" icon={<BatteryCharging size={16} />}>
        <BatteryEstimator battery={(battery.data ?? []).map((m) => ({ t: new Date(m.ts).getTime(), v: m.value }))} />
        <div className="sub-head" style={{ marginTop: 16 }}>
          Napięcie ogniwa — 30 dni
        </div>
        <QueryState data={voltage.data} error={voltage.error} loading={voltage.loading} empty={(x) => x.length === 0}>
          {(ms) => (
            <TimeSeriesChart
              height={180}
              data={toTimePoints(ms, ['voltage']).points}
              series={[{ key: 'voltage', label: 'Napięcie', color: SERIES[0], unit: 'mV', decimals: 0 }]}
            />
          )}
        </QueryState>
      </Card>
    </>
  );
}
