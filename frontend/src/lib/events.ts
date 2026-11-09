import type { AccessResult, IoTEvent } from '../api/types';
import { ACCESS_RESULT_LABELS, describeAction } from '../config/catalog';

function describeCommand(p: Record<string, unknown>) {
  return Object.entries(p)
    .filter(([k]) => k !== 'transition')
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(', ');
}

/** Opis zdarzenia czytelny dla człowieka (typy i payloady jak w mqtt_service.py). */
export function describeEvent(e: IoTEvent): string {
  const p = e.payload ?? {};
  switch (e.typ) {
    case 'action':
      return describeAction(String(p.action));
    case 'occupancy':
      return p.occupancy ? 'Wykryto obecność' : 'Brak obecności';
    case 'vibration_alarm':
      return 'Alarm: wykryto wibracje';
    case 'access_attempt': {
      const label = ACCESS_RESULT_LABELS[p.result as AccessResult] ?? String(p.result);
      return p.user_login && p.user_login !== 'unknown' ? `${label} — ${String(p.user_login)}` : label;
    }
    case 'command_sent':
      return `Polecenie z aplikacji: ${describeCommand(p)}`;
    default:
      return JSON.stringify(p);
  }
}

export function eventTone(e: IoTEvent): 'ok' | 'warn' | 'err' | 'info' | 'muted' {
  const p = e.payload ?? {};
  if (e.typ === 'vibration_alarm') return 'err';
  if (e.typ === 'access_attempt') return p.result === 'ACCESS_GRANTED' ? 'ok' : 'warn';
  return 'info';
}
