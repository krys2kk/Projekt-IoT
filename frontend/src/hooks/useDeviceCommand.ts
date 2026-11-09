import { useCallback, useRef, useState } from 'react';
import { api } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { Device } from '../api/types';
import { useToast } from '../context/ToastContext';

const CONFIRM_TIMEOUT_MS = 6000;
const CONFIRM_POLL_MS = 500;

/** Właściwości, których Zigbee2MQTT nie publikuje w stanie urządzenia — nie da się ich potwierdzić. */
const NOT_REPORTED = new Set([
  'transition',
  'effect',
  'dismiss_alarm',
  'silent_mode',
  'sensitivity',
  'child_lock',
  'do_not_disturb',
  'color_power_on_behavior',
]);

export type CommandResult =
  /** Urządzenie zgłosiło oczekiwany stan. */
  | 'confirmed'
  /** Wysłano do MQTT; ta właściwość nie jest raportowana, więc brak potwierdzenia jest normalny. */
  | 'sent'
  /** Wysłano do MQTT, ale urządzenie nie zgłosiło oczekiwanego stanu w wyznaczonym czasie. */
  | 'unconfirmed'
  | 'failed';

function isConfirmed(payload: Record<string, unknown>, device: Device, updatedBefore: string | null) {
  return Object.entries(payload)
    .filter(([k]) => !NOT_REPORTED.has(k))
    .every(([k, v]) => {
      // Kolor wraca jako {x, y} zamiast wysłanego {hex}: wystarczy nowy raport urządzenia.
      if (k === 'color') return device.updated_at !== updatedBefore;
      return device.last_state[k] === v;
    });
}

/**
 * Wysyła polecenie do urządzenia. Backend odpowiada „sent” zaraz po publikacji w MQTT,
 * więc potwierdzenie (F4) to pojawienie się oczekiwanego stanu w GET /api/devices/{id}.
 */
export function useDeviceCommand(device: Device, onUpdate?: (d: Device) => void) {
  const toast = useToast();
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [outcome, setOutcome] = useState<{ result: CommandResult; at: number } | null>(null);
  const cb = useRef(onUpdate);
  cb.current = onUpdate;
  const updatedAt = useRef(device.updated_at);
  updatedAt.current = device.updated_at;

  const send = useCallback(
    async (payload: Record<string, unknown>, key = Object.keys(payload)[0] ?? 'cmd'): Promise<CommandResult> => {
      setPending((p) => ({ ...p, [key]: true }));
      const before = updatedAt.current;
      let result: CommandResult = 'failed';
      try {
        await api.command(device.id, payload);
        result = Object.keys(payload).every((k) => NOT_REPORTED.has(k)) ? 'sent' : 'unconfirmed';
        const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
        while (result === 'unconfirmed' && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, CONFIRM_POLL_MS));
          const fresh = await api.device(device.id);
          cb.current?.(fresh);
          if (isConfirmed(payload, fresh, before)) result = 'confirmed';
        }
        if (result === 'unconfirmed') {
          toast.error('Brak potwierdzenia z urządzenia', `${device.nazwa} nie zgłosiło nowego stanu w ${CONFIRM_TIMEOUT_MS / 1000} s.`);
        }
        setOutcome({ result, at: Date.now() });
      } catch (e) {
        toast.error('Polecenie nie zostało wykonane', errorMessage(e));
      } finally {
        setPending((p) => {
          const n = { ...p };
          delete n[key];
          return n;
        });
      }
      return result;
    },
    [device.id, device.nazwa, toast],
  );

  const isPending = (key?: string) => (key ? !!pending[key] : Object.keys(pending).length > 0);
  return { send, isPending, outcome };
}
