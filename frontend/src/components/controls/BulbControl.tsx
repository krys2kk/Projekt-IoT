import { useEffect, useRef, useState } from 'react';
import { Lightbulb, Palette, Sparkles, Sun, WifiOff } from 'lucide-react';
import type { Device } from '../../api/types';
import { BRIGHTNESS_MAX, BULB_EFFECTS, COLOR_TEMP_MAX, COLOR_TEMP_MIN } from '../../config/catalog';
import { useDeviceCommand } from '../../hooks/useDeviceCommand';
import { miredToHex, miredToKelvin, xyToHex, type XY } from '../../lib/color';
import { Segmented, Toggle } from '../ui';
import { CommandNote } from './CommandNote';

const SWATCHES = ['#ff0000', '#ff7a00', '#ffd400', '#00c853', '#00bcd4', '#2a78d6', '#7c4dff', '#ff4081'];
const WHITE_PRESETS = [
  { label: 'Ciepła 2700 K', mired: 370 },
  { label: 'Neutralna 4000 K', mired: 250 },
  { label: 'Zimna 6500 K', mired: 153 },
];

/** Opóźnione wysyłanie — suwak nie zalewa sieci ZigBee poleceniami. */
function useDebounced(fn: (v: number) => void, ms = 350) {
  const t = useRef<ReturnType<typeof setTimeout>>();
  const f = useRef(fn);
  f.current = fn;
  useEffect(() => () => clearTimeout(t.current), []);
  return (v: number) => {
    clearTimeout(t.current);
    t.current = setTimeout(() => f.current(v), ms);
  };
}

function colorHexOf(color: unknown): string {
  const c = color as Partial<XY> | null | undefined;
  return typeof c?.x === 'number' && typeof c?.y === 'number' ? xyToHex(c as XY) : '#ffffff';
}

/** F5 — pełne sterowanie żarówką NOUS P3Z: wł./wył., jasność, kolor, temperatura bieli, efekty. */
export function BulbControl({ device, onUpdate, compact }: { device: Device; onUpdate: (d: Device) => void; compact?: boolean }) {
  const { send, isPending, outcome } = useDeviceCommand(device, onUpdate);
  const s = device.last_state;
  const on = s.state === 'ON';
  const disabled = !device.online;
  const devBrightness = Number(s.brightness ?? 0);
  const devCt = Number(s.color_temp ?? 250);
  const colorHex = colorHexOf(s.color);
  const mode = s.color_mode && s.color_mode !== 'color_temp' ? 'color' : 'white';

  const [tab, setTab] = useState<'color' | 'white'>(mode);
  const [brightness, setBrightness] = useState(devBrightness);
  const [ct, setCt] = useState(devCt);
  const [transition, setTransition] = useState(0.5);
  // Te właściwości nie są publikowane przez urządzenie — pamiętamy ostatnio wysłane wartości.
  const [dnd, setDnd] = useState(false);
  const [powerOnColor, setPowerOnColor] = useState('');
  const dragging = useRef(false);

  // Synchronizacja z potwierdzonym stanem urządzenia (gdy nie przeciągamy suwaka).
  useEffect(() => {
    if (!dragging.current) setBrightness(devBrightness);
  }, [devBrightness]);
  useEffect(() => {
    if (!dragging.current) setCt(devCt);
  }, [devCt]);
  useEffect(() => setTab(mode), [mode]);

  const sendBrightness = useDebounced((v) => {
    dragging.current = false;
    void send({ brightness: v, transition }, 'brightness');
  });
  const sendCt = useDebounced((v) => {
    dragging.current = false;
    void send({ color_temp: v, transition }, 'color_temp');
  });

  const preview = mode === 'color' ? colorHex : miredToHex(devCt);
  const pct = Math.round((brightness / BRIGHTNESS_MAX) * 100);
  const kelvin = miredToKelvin(ct);

  return (
    <div className="ctrl">
      {disabled && (
        <div className="inline-warn">
          <WifiOff size={14} /> Żarówka jest offline — sterowanie niedostępne.
        </div>
      )}
      <div className="bulb-top">
        <div
          className={`bulb-preview ${on ? 'on' : ''}`}
          style={{ ['--bulb' as string]: preview, ['--bulb-a' as string]: String(0.25 + (devBrightness / 254) * 0.75) }}
          aria-label={on ? `Żarówka świeci, kolor ${preview}` : 'Żarówka wyłączona'}
          role="img"
        >
          <Lightbulb size={30} />
        </div>
        <div className="bulb-main">
          <div className="row-between">
            <div>
              <div className="socket-name">{s.state === undefined ? 'Brak danych o stanie' : on ? 'Włączona' : 'Wyłączona'}</div>
              {s.brightness !== undefined && (
                <div className="muted small">
                  {mode === 'color' ? `Kolor ${colorHex.toUpperCase()}` : `Biel ${miredToKelvin(devCt)} K`} · jasność{' '}
                  {Math.round((devBrightness / BRIGHTNESS_MAX) * 100)}%
                </div>
              )}
            </div>
            <Toggle
              checked={on}
              pending={isPending('state')}
              disabled={disabled}
              onChange={(v) => void send({ state: v ? 'ON' : 'OFF', transition }, 'state')}
              label="Żarówka"
            />
          </div>
          <label className="slider-field">
            <span>
              <Sun size={14} /> Jasność <strong>{pct}%</strong>
            </span>
            <input
              type="range"
              min={1}
              max={BRIGHTNESS_MAX}
              value={Math.max(1, brightness)}
              disabled={disabled}
              onChange={(e) => {
                dragging.current = true;
                const v = Number(e.target.value);
                setBrightness(v);
                sendBrightness(v);
              }}
              aria-label="Jasność"
            />
          </label>
        </div>
      </div>

      <Segmented
        value={tab}
        onChange={setTab}
        label="Tryb barwy"
        options={[
          { value: 'color', label: <><Palette size={14} /> Kolor RGB</> },
          { value: 'white', label: <><Sun size={14} /> Temperatura bieli</> },
        ]}
      />

      {tab === 'color' ? (
        <div className="color-pane">
          <div className="swatches">
            {SWATCHES.map((c) => (
              <button
                key={c}
                className="swatch"
                style={{ background: c }}
                disabled={disabled}
                onClick={() => void send({ color: { hex: c }, transition }, 'color')}
                aria-label={`Kolor ${c}`}
              />
            ))}
            <label className="swatch swatch-custom" title="Dowolny kolor">
              <input
                type="color"
                value={colorHex}
                disabled={disabled}
                onChange={(e) => void send({ color: { hex: e.target.value }, transition }, 'color')}
                aria-label="Dowolny kolor"
              />
            </label>
          </div>
        </div>
      ) : (
        <div className="white-pane">
          <label className="slider-field">
            <span>
              Temperatura bieli <strong>{kelvin} K</strong> <span className="muted small">({ct} mired)</span>
            </span>
            <input
              className="ct-slider"
              type="range"
              min={COLOR_TEMP_MIN}
              max={COLOR_TEMP_MAX}
              // suwak: lewo = ciepła (dużo miredów), prawo = zimna
              value={COLOR_TEMP_MAX + COLOR_TEMP_MIN - ct}
              disabled={disabled}
              onChange={(e) => {
                dragging.current = true;
                const v = COLOR_TEMP_MAX + COLOR_TEMP_MIN - Number(e.target.value);
                setCt(v);
                sendCt(v);
              }}
              aria-label="Temperatura bieli"
            />
          </label>
          <div className="row-wrap">
            {WHITE_PRESETS.map((p) => (
              <button
                key={p.mired}
                className="btn btn-sm"
                disabled={disabled}
                onClick={() => void send({ color_temp: p.mired, transition }, 'color_temp')}
              >
                <span className="dot-swatch" style={{ background: miredToHex(p.mired) }} /> {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="sub-head">
          <Sparkles size={14} /> Efekty
        </div>
        <div className="effects">
          {BULB_EFFECTS.map((e) => (
            <button
              key={e.value}
              className="btn btn-sm"
              disabled={disabled || isPending('effect')}
              onClick={() => void send({ effect: e.value }, 'effect')}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <CommandNote outcome={outcome} />

      {!compact && (
        <details className="advanced">
          <summary>Ustawienia zaawansowane</summary>
          <div className="adv-grid">
            <label className="inline-field">
              Czas przejścia
              <select value={transition} onChange={(e) => setTransition(Number(e.target.value))}>
                <option value={0}>natychmiast</option>
                <option value={0.5}>0,5 s</option>
                <option value={1}>1 s</option>
                <option value={2}>2 s</option>
              </select>
            </label>
            <label className="inline-field">
              Tryb „nie przeszkadzać”
              <Toggle
                checked={dnd}
                disabled={disabled}
                pending={isPending('do_not_disturb')}
                onChange={(v) =>
                  void send({ do_not_disturb: v }).then((r) => {
                    if (r !== 'failed') setDnd(v);
                  })
                }
                label="Nie przeszkadzać"
              />
            </label>
            <label className="inline-field">
              Kolor po włączeniu zasilania
              <select
                disabled={disabled}
                value={powerOnColor}
                onChange={(e) => {
                  const v = e.target.value;
                  void send({ color_power_on_behavior: v }).then((r) => {
                    if (r !== 'failed') setPowerOnColor(v);
                  });
                }}
              >
                {!powerOnColor && <option value="">—</option>}
                <option value="initial">domyślny</option>
                <option value="previous">poprzedni</option>
                <option value="customized">własny</option>
              </select>
            </label>
          </div>
        </details>
      )}
    </div>
  );
}
