import { useState } from 'react';
import { api } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { Automation } from '../api/types';
import { usePolling } from '../hooks/usePolling';
import { useToast } from '../context/ToastContext';
import { formatAction, formatCondition } from '../lib/automations';
import { Badge, PageHeader, QueryState, Toggle } from '../components/ui';

function Rule({ a, onToggle, pending }: { a: Automation; onToggle: (v: boolean) => void; pending: boolean }) {
  return (
    <article className={`rule ${a.aktywna ? '' : 'disabled'}`}>
      <header className="rule-head">
        <div>
          <h3>{a.nazwa}</h3>
        </div>
        <div className="rule-toggle">
          <Badge tone={a.aktywna ? 'ok' : 'muted'}>{a.aktywna ? 'włączona' : 'wyłączona'}</Badge>
          <Toggle checked={a.aktywna} pending={pending} onChange={onToggle} label={`Reguła ${a.nazwa}`} />
        </div>
      </header>
      <div className="rule-flow">
        <div>
          <span className="rule-k">KIEDY</span>
          <span className="mono small">{formatCondition(a.trigger)}</span>
        </div>
        {a.warunek && (
          <div>
            <span className="rule-k">JEŚLI</span>
            <span className="mono small">{formatCondition(a.warunek)}</span>
          </div>
        )}
        <div>
          <span className="rule-k">TO</span>
          <span className="mono small">{formatAction(a.akcja)}</span>
        </div>
      </div>
    </article>
  );
}

/** F8 — automatyzacje: logika działa na backendzie, z aplikacji tylko je włączamy/wyłączamy. */
export function AutomationsPage() {
  const toast = useToast();
  const autos = usePolling(() => api.automations(), 5000);
  const [pending, setPending] = useState<number | null>(null);

  async function toggle(a: Automation, aktywna: boolean) {
    setPending(a.id);
    try {
      const updated = await api.setAutomationEnabled(a.id, aktywna);
      autos.setData((list) => list?.map((x) => (x.id === a.id ? updated : x)));
      toast.success(aktywna ? 'Reguła włączona' : 'Reguła wyłączona', a.nazwa);
    } catch (e) {
      toast.error('Nie udało się zmienić reguły', errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  const active = autos.data?.filter((a) => a.aktywna).length ?? 0;

  return (
    <>
      <PageHeader
        title="Automatyzacje"
        subtitle={`Zdarzenie wyzwala akcję; reguła wyłączona nie działa · aktywne ${active} z ${autos.data?.length ?? 0}`}
      />
      <QueryState data={autos.data} error={autos.error} loading={autos.loading} onRetry={autos.reload} empty={(x) => x.length === 0}>
        {(list) => (
          <div className="rules">
            {list.map((a) => (
              <Rule key={a.id} a={a} pending={pending === a.id} onToggle={(v) => void toggle(a, v)} />
            ))}
          </div>
        )}
      </QueryState>
    </>
  );
}
