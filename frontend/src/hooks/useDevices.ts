import { useCallback } from 'react';
import { api } from '../api/endpoints';
import type { Device } from '../api/types';
import { usePolling } from './usePolling';

/** Lista urządzeń odświeżana co kilka sekund + lokalna aktualizacja po potwierdzonym poleceniu. */
export function useDevices(intervalMs = 4000) {
  const q = usePolling(() => api.devices(), intervalMs);
  const { setData } = q;
  const update = useCallback(
    (d: Device) => setData((list) => list?.map((x) => (x.id === d.id ? d : x))),
    [setData],
  );
  const byId = (id: string) => q.data?.find((d) => d.id === id);
  return { ...q, update, byId };
}
