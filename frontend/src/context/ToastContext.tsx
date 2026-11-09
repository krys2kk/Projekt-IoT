import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  /** Kolor paska (np. kolor diody przy wyniku autoryzacji). */
  accent?: string;
  icon?: ReactNode;
}

interface ToastApi {
  push: (t: Omit<Toast, 'id'>, ttlMs?: number) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (t: Omit<Toast, 'id'>, ttlMs = 5000) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-4), { ...t, id }]);
      setTimeout(() => dismiss(id), ttlMs);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (title, message) => push({ kind: 'success', title, message }),
      error: (title, message) => push({ kind: 'error', title, message }, 7000),
      info: (title, message) => push({ kind: 'info', title, message }),
    }),
    [push],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} style={t.accent ? { borderLeftColor: t.accent } : undefined}>
            <span className="toast-icon" style={t.accent ? { color: t.accent } : undefined}>
              {t.icon ??
                (t.kind === 'success' ? <CheckCircle2 size={18} /> : t.kind === 'error' ? <XCircle size={18} /> : <Info size={18} />)}
            </span>
            <div className="toast-body">
              <div className="toast-title">{t.title}</div>
              {t.message && <div className="toast-msg">{t.message}</div>}
            </div>
            <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Zamknij powiadomienie">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast poza ToastProvider');
  return ctx;
}
