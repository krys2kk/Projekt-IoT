import { api } from '../../api/endpoints';
import type { Automation, Device } from '../../api/types';
import {
  ACCESS_RESULT_LABELS,
  ACCESS_RESULT_LED,
  ACCESS_RESULTS,
  ACCESS_TIMEOUT_LED,
  BUTTON_ACTION_LABELS,
  BUTTON_ACTIONS,
  REMOTE_GESTURES,
} from '../../config/catalog';
import { usePolling } from '../../hooks/usePolling';
import { formatAction } from '../../lib/automations';
import { fmtRelative } from '../../lib/format';
import { Led } from '../deviceBits';

/** Reguły backendu wyzwalane akcją tego urządzenia i ostatnia akcja z rejestru zdarzeń. */
function useActionInfo(deviceId: string) {
  const autos = usePolling(() => api.automations(), 10_000);
  const last = usePolling(() => api.events({ device_id: deviceId, type: 'action', limit: 1 }), 3000, [deviceId]);
  const rules = (autos.data ?? []).filter((a) => a.trigger.device_id === deviceId && (a.trigger.field ?? 'action') === 'action');
  const ev = last.data?.[0];
  return {
    rulesFor: (action: string): Automation[] => rules.filter((r) => r.trigger.value === action),
    lastAction: ev ? String(ev.payload.action ?? '') : '',
    lastTs: ev?.ts ?? null,
  };
}

function RuleCell({ rules }: { rules: Automation[] }) {
  if (!rules.length) return <span className="muted">brak reguły</span>;
  return (
    <>
      {rules.map((r) => (
        <span key={r.id} className={r.aktywna ? '' : 'muted'} title={r.nazwa}>
          {formatAction(r.akcja)}
          {!r.aktywna && ' (wyłączona)'}
        </span>
      ))}
    </>
  );
}

/** F3 — pilot XH-SY-04Z / TS0044: 4 przyciski × 3 gesty = 12 zdarzeń. */
export function RemoteScenes({ device }: { device: Device }) {
  const { rulesFor, lastAction, lastTs } = useActionInfo(device.id);
  return (
    <div className="ctrl">
      <div className="muted small">
        Ostatnia akcja: <strong>{lastAction || '—'}</strong>
        {lastTs && ` · ${fmtRelative(lastTs)}`}
      </div>
      <div className="scene-grid" role="table" aria-label="Akcje pilota">
        <div className="scene-h" />
        {REMOTE_GESTURES.map((g) => (
          <div key={g} className="scene-h">
            {BUTTON_ACTION_LABELS[g]}
          </div>
        ))}
        {[1, 2, 3, 4].map((b) => (
          <div key={b} className="scene-row" role="row">
            <div className="scene-h">Przycisk {b}</div>
            {REMOTE_GESTURES.map((g) => {
              const a = `${b}_${g}`;
              return (
                <div key={a} className={`scene-cell ${a === lastAction ? 'active' : ''}`} role="cell">
                  <span className="mono small muted">{a}</span>
                  <RuleCell rules={rulesFor(a)} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** F3 — przycisk SNZB-01P: single / double / long. */
export function ButtonActions({ device }: { device: Device }) {
  const { rulesFor, lastAction, lastTs } = useActionInfo(device.id);
  return (
    <div className="ctrl">
      <div className="muted small">
        Ostatnia akcja: <strong>{lastAction ? BUTTON_ACTION_LABELS[lastAction] ?? lastAction : '—'}</strong>
        {lastTs && ` · ${fmtRelative(lastTs)}`}
      </div>
      <ul className="simple-list">
        {BUTTON_ACTIONS.map((a) => (
          <li key={a} className={a === lastAction ? 'active' : ''}>
            <span className="mono small">{a}</span>
            <span className="grow">{BUTTON_ACTION_LABELS[a]}</span>
            <span className="small">
              <RuleCell rules={rulesFor(a)} />
            </span>
          </li>
        ))}
      </ul>
      <div className="muted small">Urządzenie usypia między naciśnięciami — nie przyjmuje poleceń.</div>
    </div>
  );
}

/** Moduł kontroli dostępu ESP32-C6 — ostatnia decyzja serwera. */
export function KeypadInfo({ device }: { device: Device }) {
  const q = usePolling(() => api.accessAttempts({ limit: 50 }), 3000);
  const last = q.data?.find((a) => a.device_id === device.id);
  const r = last?.wynik ?? null;
  return (
    <div className="ctrl">
      <div className="keypad-info">
        <Led result={r} size={44} />
        <div>
          <div className="socket-name">{r ? ACCESS_RESULT_LABELS[r] ?? r : 'Brak prób'}</div>
          {last && (
            <div className="muted small">
              kod decyzji = {last.kod_decyzji}
              {last.user_login ? ` · ${last.user_login}` : ''} · {fmtRelative(last.ts)}
            </div>
          )}
        </div>
      </div>
      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr>
              <th>Kod</th>
              <th>Decyzja serwera</th>
              <th>Dioda</th>
            </tr>
          </thead>
          <tbody>
            {ACCESS_RESULTS.map((k, i) => (
              <tr key={k}>
                <td className="mono">{i + 1}</td>
                <td>{ACCESS_RESULT_LABELS[k]}</td>
                <td>
                  <span className="dot-swatch" style={{ background: ACCESS_RESULT_LED[k].color }} /> {ACCESS_RESULT_LED[k].name}
                </td>
              </tr>
            ))}
            <tr>
              <td className="mono">— (3 s)</td>
              <td>Brak odpowiedzi serwera</td>
              <td>
                <span className="dot-swatch" style={{ background: ACCESS_TIMEOUT_LED.color }} /> {ACCESS_TIMEOUT_LED.name}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
