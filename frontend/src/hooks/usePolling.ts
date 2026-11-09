import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Pobiera dane i odświeża je cyklicznie (dane „na żywo” bez WebSocketów — kontrakt to HTTP/JSON).
 * Przy błędzie zachowuje ostatnie poprawne dane i ponawia próbę w kolejnym cyklu (F14).
 */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const seq = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (silent: boolean) => {
    const my = ++seq.current;
    if (!silent) setLoading(true);
    try {
      const d = await fetcherRef.current();
      if (mounted.current && my === seq.current) {
        setData(d);
        setError(null);
        setUpdatedAt(Date.now());
      }
    } catch (e) {
      if (mounted.current && my === seq.current) setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (mounted.current && my === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setData(undefined);
    void load(false);
    if (!intervalMs) return;
    const id = setInterval(() => {
      if (!document.hidden) void load(true);
    }, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, intervalMs, ...deps]);

  const reload = useCallback(() => load(true), [load]);

  return { data, error, loading: loading && data === undefined, refreshing: loading, updatedAt, reload, setData };
}
