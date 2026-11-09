import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, RefreshCw, X } from 'lucide-react';
import { errorMessage } from '../api/client';

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
  icon,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div className="card-title-wrap">
            {icon && <span className="card-icon">{icon}</span>}
            <div>
              {title && <h2 className="card-title">{title}</h2>}
              {subtitle && <div className="card-sub">{subtitle}</div>}
            </div>
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

export type Tone = 'ok' | 'warn' | 'err' | 'info' | 'muted' | 'serious';

export function Badge({ tone = 'muted', children, icon }: { tone?: Tone; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={`badge badge-${tone}`}>
      {icon}
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  unit,
  sub,
  icon,
  tone,
  warn,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  warn?: string | null;
}) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-label">
        {icon && <span className="stat-icon">{icon}</span>}
        {label}
      </div>
      <div className="stat-value">
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      {warn && (
        <div className="stat-warn">
          <AlertTriangle size={13} /> {warn}
        </div>
      )}
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
  pending,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  pending?: boolean;
  label?: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={pending}
      disabled={disabled || pending}
      className={`switch ${checked ? 'on' : ''} ${pending ? 'pending' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob">{pending && <Loader2 size={12} className="spin" />}</span>
    </button>
  );
}

export function Spinner({ label = 'Ładowanie…' }: { label?: string }) {
  return (
    <div className="center-msg">
      <Loader2 className="spin" size={20} /> {label}
    </div>
  );
}

export function EmptyState({ children = 'Brak danych w wybranym zakresie' }: { children?: ReactNode }) {
  return (
    <div className="center-msg muted">
      <Inbox size={20} /> {children}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="center-msg error-msg" role="alert">
      <AlertTriangle size={18} />
      <span>{errorMessage(error)}</span>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry}>
          <RefreshCw size={14} /> Ponów
        </button>
      )}
    </div>
  );
}

/** Stan zapytania: ładowanie / błąd (z zachowaniem starych danych) / brak danych. */
export function QueryState<T>({
  data,
  error,
  loading,
  onRetry,
  empty,
  children,
}: {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  onRetry?: () => void;
  empty?: (d: T) => boolean;
  children: (d: T) => ReactNode;
}) {
  if (data === undefined) {
    if (error) return <ErrorState error={error} onRetry={onRetry} />;
    if (loading) return <Spinner />;
    return <EmptyState />;
  }
  return (
    <>
      {error && (
        <div className="inline-warn" role="alert">
          <AlertTriangle size={14} /> Nie udało się odświeżyć danych ({errorMessage(error)}) — wyświetlane są ostatnie znane wartości.
        </div>
      )}
      {empty?.(data) ? <EmptyState /> : children(data)}
    </>
  );
}

export function Modal({
  title,
  open,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <header className="modal-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Zamknij">
              <X size={18} />
            </button>
          </header>
          <div className="modal-body">{children}</div>
          {footer && <footer className="modal-foot">{footer}</footer>}
        </>
      )}
    </dialog>
  );
}

export function Pagination({
  page,
  pageCount,
  onPage,
  total,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
  total: number;
}) {
  if (pageCount <= 1) return <div className="pager muted">{total} rekordów</div>;
  return (
    <div className="pager">
      <span className="muted">
        {total} rekordów · strona {page + 1} z {pageCount}
      </span>
      <div className="pager-btns">
        <button className="btn btn-sm" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Poprzednia strona">
          <ChevronLeft size={14} />
        </button>
        <button
          className="btn btn-sm"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
          aria-label="Następna strona"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="glitch" data-text={title}>
          {title}
        </h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
