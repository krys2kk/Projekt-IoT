import { useState } from 'react';
import { Plug, WifiOff } from 'lucide-react';
import type { Device } from '../../api/types';
import { useDeviceCommand } from '../../hooks/useDeviceCommand';
import { fmtValue } from '../../lib/format';
import { Toggle } from '../ui';
import { CommandNote } from './CommandNote';

const LINES = ['l1', 'l2', 'l3'] as const;

/** F4 — trzy niezależne gniazda listwy NOUS A11Z + odczyt zużycia energii elektrycznej. */
export function PowerStripControl({
  device,
  onUpdate,
  compact,
}: {
  device: Device;
  onUpdate: (d: Device) => void;
  compact?: boolean;
}) {
  const { send, isPending, outcome } = useDeviceCommand(device, onUpdate);
  const s = device.last_state;
  const disabled = !device.online;
  const [countdown, setCountdown] = useState<Record<string, string>>({});
  // child_lock nie jest publikowany przez urządzenie — pamiętamy ostatnio wysłaną wartość.
  const [childLock, setChildLock] = useState(false);

  return (
    <div className="ctrl">
      {disabled && (
        <div className="inline-warn">
          <WifiOff size={14} /> Listwa jest offline — sterowanie niedostępne do czasu odzyskania łączności.
        </div>
      )}
      <div className="sockets">
        {LINES.map((l) => {
          const key = `state_${l}`;
          const on = s[key] === 'ON';
          return (
            <div key={l} className={`socket ${on ? 'on' : ''}`}>
              <span className="socket-icon">
                <Plug size={18} />
              </span>
              <div className="socket-text">
                <div className="socket-name">Gniazdo {l.slice(1)}</div>
              </div>
              <span className={`socket-state ${on ? 'on' : ''}`}>
                {isPending(key) ? '…' : s[key] === undefined ? '—' : on ? 'WŁ.' : 'WYŁ.'}
              </span>
              <Toggle
                checked={on}
                pending={isPending(key)}
                disabled={disabled}
                onChange={(v) => void send({ [key]: v ? 'ON' : 'OFF' })}
                label={`Gniazdo ${l.slice(1)}`}
              />
            </div>
          );
        })}
      </div>

      <div className="mini-stats">
        <div>
          <span className="muted small">Moc</span>
          <strong>{fmtValue(s.power, 'W', 1)}</strong>
        </div>
        <div>
          <span className="muted small">Napięcie</span>
          <strong>{fmtValue(s.voltage, 'V', 1)}</strong>
        </div>
        <div>
          <span className="muted small">Prąd</span>
          <strong>{fmtValue(s.current, 'A', 2)}</strong>
        </div>
        <div>
          <span className="muted small">Energia (licznik)</span>
          <strong>{fmtValue(s.energy, 'kWh', 2)}</strong>
        </div>
      </div>

      <CommandNote outcome={outcome} />

      {!compact && (
        <details className="advanced">
          <summary>Ustawienia zaawansowane</summary>
          <div className="adv-grid">
            {LINES.map((l) => (
              <div key={l} className="adv-row">
                <strong>Gniazdo {l.slice(1)}</strong>
                <label className="inline-field">
                  Wyłącz za (s)
                  <input
                    type="number"
                    min={0}
                    max={43200}
                    value={countdown[l] ?? String(s[`countdown_${l}`] ?? 0)}
                    onChange={(e) => setCountdown((c) => ({ ...c, [l]: e.target.value }))}
                  />
                  <button
                    className="btn btn-sm"
                    disabled={disabled || isPending(`countdown_${l}`)}
                    onClick={() => void send({ [`countdown_${l}`]: Number(countdown[l] ?? s[`countdown_${l}`] ?? 0) })}
                  >
                    Ustaw
                  </button>
                </label>
                <label className="inline-field">
                  Po zaniku zasilania
                  <select
                    disabled={disabled}
                    value={String(s[`power_on_behavior_${l}`] ?? '')}
                    onChange={(e) => void send({ [`power_on_behavior_${l}`]: e.target.value })}
                  >
                    {s[`power_on_behavior_${l}`] === undefined && <option value="">—</option>}
                    <option value="off">wyłączone</option>
                    <option value="previous">poprzedni stan</option>
                    <option value="on">włączone</option>
                  </select>
                </label>
              </div>
            ))}
            <div className="adv-row">
              <strong>Listwa</strong>
              <label className="inline-field">
                Blokada rodzicielska
                <Toggle
                  checked={childLock}
                  disabled={disabled}
                  pending={isPending('child_lock')}
                  onChange={(v) =>
                    void send({ child_lock: v ? 'LOCK' : 'UNLOCK' }).then((r) => {
                      if (r !== 'failed') setChildLock(v);
                    })
                  }
                  label="Blokada rodzicielska"
                />
              </label>
              <label className="inline-field">
                Podświetlenie
                <select
                  disabled={disabled}
                  value={String(s.indicator_mode ?? '')}
                  onChange={(e) => void send({ indicator_mode: e.target.value })}
                >
                  {s.indicator_mode === undefined && <option value="">—</option>}
                  <option value="off">wyłączone</option>
                  <option value="off/on">gdy wyłączone</option>
                  <option value="on/off">gdy włączone</option>
                  <option value="on">zawsze</option>
                </select>
              </label>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
