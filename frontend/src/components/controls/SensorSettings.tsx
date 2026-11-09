import { useEffect, useState } from 'react';
import { BellOff, Siren, UserCheck, UserX } from 'lucide-react';
import type { Device } from '../../api/types';
import { useDeviceCommand } from '../../hooks/useDeviceCommand';
import { Badge, Toggle } from '../ui';
import { CommandNote } from './CommandNote';

/** NOUS E14 (TS0601_vibration_alarm_sensor): alarm_status + ustawienia, których urządzenie nie publikuje. */
export function VibrationSettings({ device, onUpdate }: { device: Device; onUpdate: (d: Device) => void }) {
  const { send, isPending, outcome } = useDeviceCommand(device, onUpdate);
  const s = device.last_state;
  const alarm = s.alarm_status === 'alarm';
  const disabled = !device.online;
  const [sensitivity, setSensitivity] = useState('');
  const [silent, setSilent] = useState(false);
  return (
    <div className="ctrl">
      <div className="row-between">
        <div className={`big-state ${alarm ? 'err' : s.alarm_status ? 'ok' : ''}`}>
          <Siren size={22} /> {alarm ? 'ALARM — wykryto wibracje' : s.alarm_status ? 'Stan normalny' : 'Brak danych'}
        </div>
        <button
          className="btn btn-sm"
          disabled={disabled || !alarm || isPending('dismiss_alarm')}
          onClick={() => void send({ dismiss_alarm: 'DISMISS' })}
        >
          <BellOff size={14} /> Wycisz alarm
        </button>
      </div>
      <div className="adv-grid">
        <label className="inline-field">
          Czułość
          <select
            disabled={disabled}
            value={sensitivity}
            onChange={(e) => {
              const v = e.target.value;
              void send({ sensitivity: v }).then((r) => {
                if (r !== 'failed') setSensitivity(v);
              });
            }}
          >
            {!sensitivity && <option value="">—</option>}
            <option value="low">niska</option>
            <option value="middle">średnia</option>
            <option value="high">wysoka</option>
          </select>
        </label>
        <label className="inline-field">
          Tryb cichy (bez syreny)
          <Toggle
            checked={silent}
            disabled={disabled}
            pending={isPending('silent_mode')}
            onChange={(v) =>
              void send({ silent_mode: v ? 'ON' : 'OFF' }).then((r) => {
                if (r !== 'failed') setSilent(v);
              })
            }
            label="Tryb cichy"
          />
        </label>
        <div className="inline-field">
          Stan baterii
          <Badge tone={s.battery_state === 'low' ? 'err' : 'muted'}>{String(s.battery_state ?? '—')}</Badge>
        </div>
      </div>
      <CommandNote outcome={outcome} />
    </div>
  );
}

/** SONOFF SNZB-06P: occupancy, illumination, occupancy_timeout, occupancy_sensitivity. */
export function PresenceSettings({ device, onUpdate }: { device: Device; onUpdate: (d: Device) => void }) {
  const { send, isPending, outcome } = useDeviceCommand(device, onUpdate);
  const s = device.last_state;
  const occ = Boolean(s.occupancy);
  const known = s.occupancy !== undefined;
  const disabled = !device.online;
  const [timeout, setTimeoutVal] = useState(String(s.occupancy_timeout ?? ''));
  useEffect(() => {
    if (s.occupancy_timeout !== undefined) setTimeoutVal(String(s.occupancy_timeout));
  }, [s.occupancy_timeout]);
  return (
    <div className="ctrl">
      <div className={`big-state ${occ ? 'info' : 'muted'}`}>
        {occ ? <UserCheck size={22} /> : <UserX size={22} />} {!known ? 'Brak danych' : occ ? 'Wykryto obecność' : 'Brak obecności'}
        {s.illumination !== undefined && <span className="muted small">· {s.illumination === 'bright' ? 'jasno' : 'ciemno'}</span>}
      </div>
      <div className="adv-grid">
        <label className="inline-field">
          Czas braku obecności (s)
          <input type="number" min={15} max={65535} value={timeout} onChange={(e) => setTimeoutVal(e.target.value)} />
          <button
            className="btn btn-sm"
            disabled={disabled || !timeout || isPending('occupancy_timeout')}
            onClick={() => void send({ occupancy_timeout: Number(timeout) })}
          >
            Ustaw
          </button>
        </label>
        <label className="inline-field">
          Czułość radaru
          <select
            disabled={disabled}
            value={String(s.occupancy_sensitivity ?? '')}
            onChange={(e) => void send({ occupancy_sensitivity: e.target.value })}
          >
            {s.occupancy_sensitivity === undefined && <option value="">—</option>}
            <option value="low">niska</option>
            <option value="medium">średnia</option>
            <option value="high">wysoka</option>
          </select>
        </label>
      </div>
      <CommandNote outcome={outcome} />
    </div>
  );
}
