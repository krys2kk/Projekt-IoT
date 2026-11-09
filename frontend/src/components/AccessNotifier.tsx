import { useEffect, useRef } from 'react';
import { api } from '../api/endpoints';
import { ACCESS_RESULT_LABELS, ACCESS_RESULT_LED } from '../config/catalog';
import { useToast } from '../context/ToastContext';
import { fmtTime } from '../lib/format';
import { AccessResultIcon } from './deviceBits';

/**
 * F6 — „komunikat w aplikacji”: każda nowa próba autoryzacji na klawiaturze
 * wyświetla powiadomienie w kolorze diody, niezależnie od otwartego widoku.
 */
export function AccessNotifier() {
  const toast = useToast();
  const lastId = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const list = await api.accessAttempts({ limit: 10 });
        if (cancelled) return;
        const newest = list.reduce((m, a) => Math.max(m, a.id), 0);
        if (lastId.current === null) {
          lastId.current = newest;
          return;
        }
        const seen = lastId.current;
        const fresh = list.filter((a) => a.id > seen).sort((a, b) => a.id - b.id);
        lastId.current = Math.max(seen, newest);
        for (const a of fresh) {
          toast.push(
            {
              kind: a.wynik === 'ACCESS_GRANTED' ? 'success' : 'error',
              title: ACCESS_RESULT_LABELS[a.wynik] ?? a.wynik,
              message: `${a.user_login ?? 'nieznany kod'} · ${a.device_id} · ${fmtTime(a.ts)}`,
              accent: ACCESS_RESULT_LED[a.wynik]?.color,
              icon: <AccessResultIcon result={a.wynik} />,
            },
            6000,
          );
        }
      } catch {
        /* błąd połączenia sygnalizuje baner — tu po prostu spróbujemy ponownie */
      }
    }
    void poll();
    const id = setInterval(() => {
      if (!document.hidden) void poll();
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [toast]);

  return null;
}
