import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, FileText, Printer } from 'lucide-react';
import { api } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { AccessResult, UserReport } from '../api/types';
import { ACCESS_RESULT_LABELS, ACCESS_RESULT_LED, ACCESS_RESULTS, roleLabel } from '../config/catalog';
import { usePolling } from '../hooks/usePolling';
import { useToast } from '../context/ToastContext';
import { downloadText, fileStamp } from '../lib/download';
import { fmtDate, fmtDateTime, fmtDayLabel } from '../lib/format';
import { toApiTime, toLocalDateInput } from '../lib/time';
import { Badge, Card, Field, PageHeader, QueryState, StatTile } from '../components/ui';
import { BarSeriesChart } from '../components/charts';
import { AccessResultBadge } from '../components/deviceBits';

function dayKey(d: Date) {
  return toLocalDateInput(d);
}

function ReportView({ r, from, to }: { r: UserReport; from: Date; to: Date }) {
  const perDay = useMemo(() => {
    const map = new Map<string, Record<AccessResult, number>>();
    for (let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d <= to; d.setDate(d.getDate() + 1)) {
      map.set(dayKey(d), { ACCESS_GRANTED: 0, INVALID_PIN: 0, FORBIDDEN: 0 });
    }
    for (const a of r.attempts) {
      const row = map.get(dayKey(new Date(a.ts)));
      if (row && a.wynik in row) row[a.wynik]++;
    }
    return [...map.entries()].map(([k, v]) => ({ key: k, label: fmtDayLabel(`${k}T12:00:00`), ...v }));
  }, [r, from, to]);

  const days = new Set(r.attempts.filter((a) => a.wynik === 'ACCESS_GRANTED').map((a) => dayKey(new Date(a.ts)))).size;
  const used = ACCESS_RESULTS.filter((x) => r.attempts.some((a) => a.wynik === x));
  const series = (used.length ? used : (['ACCESS_GRANTED'] as AccessResult[])).map((x) => ({
    key: x,
    label: ACCESS_RESULT_LABELS[x],
    color: ACCESS_RESULT_LED[x].color,
    unit: 'prób',
    decimals: 0,
  }));

  return (
    <div className="report">
      <div className="report-head">
        <div>
          <h2>Raport dostępu: {r.user.login}</h2>
          <div className="muted">
            {roleLabel(r.user.rola)} · {r.user.aktywny ? 'konto aktywne' : 'konto zablokowane'}
          </div>
        </div>
        <div className="report-period">
          Okres: <strong>{fmtDate(from)}</strong> – <strong>{fmtDate(to)}</strong>
          <div className="muted small">Wygenerowano {fmtDateTime(new Date())}</div>
        </div>
      </div>

      <div className="stats-grid five">
        <StatTile label="Wszystkie próby" value={r.total_attempts} />
        <StatTile label="Dostęp przyznany" value={r.granted_count} />
        <StatTile label="Brak uprawnień" value={r.denied_forbidden_count} />
        <StatTile label="Dni z wejściem" value={days} />
        <StatTile label="Ostatnia próba" value={r.last_attempt_ts ? fmtDate(r.last_attempt_ts) : '—'} />
      </div>

      <div className="sub-head">Próby dostępu w kolejnych dniach</div>
      <BarSeriesChart data={perDay} series={series} stacked height={220} tooltipTitle={(d) => fmtDate(`${d.key}T12:00:00`)} />

      <div className="sub-head">Wszystkie próby w okresie ({r.attempts.length})</div>
      {r.attempts.length === 0 ? (
        <div className="muted">Brak prób dostępu w wybranym okresie.</div>
      ) : (
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>#</th>
                <th>Data i czas</th>
                <th>Wynik</th>
                <th>Urządzenie</th>
              </tr>
            </thead>
            <tbody>
              {r.attempts.map((a, i) => (
                <tr key={a.id}>
                  <td className="num muted">{r.attempts.length - i}</td>
                  <td>{fmtDateTime(a.ts)}</td>
                  <td>
                    <AccessResultBadge result={a.wynik} />
                  </td>
                  <td className="mono small">{a.device_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">
        Próby z błędnym kodem nie są przypisane do żadnego użytkownika (PIN nie pasuje do konta) — widoczne są w rejestrze kontroli dostępu.
      </p>
    </div>
  );
}

/** F11 — raport dostępu wybranego użytkownika w zadanym okresie + eksport CSV. */
export function ReportsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const users = usePolling(() => api.users(), null);
  const now = new Date();
  const [fromDay, setFromDay] = useState(() => toLocalDateInput(new Date(now.getTime() - 29 * 86_400_000)));
  const [toDay, setToDay] = useState(() => toLocalDateInput(now));
  const userId = Number(params.get('user') ?? users.data?.[0]?.id ?? 0) || null;

  const from = useMemo(() => new Date(`${fromDay}T00:00:00`), [fromDay]);
  const to = useMemo(() => new Date(`${toDay}T23:59:59`), [toDay]);
  const fromIso = toApiTime(from);
  const toIso = toApiTime(to);
  const report = usePolling(
    () => (userId ? api.userReport(userId, { from: fromIso, to: toIso }) : Promise.resolve(undefined)),
    null,
    [userId, fromIso, toIso],
  );

  async function exportCsv() {
    if (!userId) return;
    try {
      const csv = await api.exportCsv({ dataset: 'access_attempts', user_id: userId, from: fromIso, to: toIso });
      const login = report.data?.user.login ?? userId;
      downloadText(`raport-dostepu-${login}-${fileStamp()}.csv`, csv);
    } catch (e) {
      toast.error('Eksport nie powiódł się', errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader
        title="Raporty"
        subtitle="Raport z dostępu danego użytkownika — wszystkie próby w zadanym okresie"
        actions={
          <>
            <button className="btn" disabled={!report.data} onClick={() => void exportCsv()}>
              <Download size={16} /> Eksport CSV
            </button>
            <button className="btn" disabled={!report.data} onClick={() => window.print()}>
              <Printer size={16} /> Drukuj / PDF
            </button>
          </>
        }
      />
      <Card className="no-print">
        <div className="filters">
          <Field label="Użytkownik">
            <select value={userId ?? ''} onChange={(e) => setParams({ user: e.target.value })} disabled={!users.data}>
              {(users.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.login}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Od">
            <input type="date" value={fromDay} max={toDay} onChange={(e) => e.target.value && setFromDay(e.target.value)} />
          </Field>
          <Field label="Do">
            <input type="date" value={toDay} min={fromDay} onChange={(e) => e.target.value && setToDay(e.target.value)} />
          </Field>
          {report.data && !report.data.user.aktywny && <Badge tone="err">konto zablokowane</Badge>}
        </div>
      </Card>
      <Card title="Raport" icon={<FileText size={16} />}>
        <QueryState data={report.data} error={report.error} loading={report.loading} onRetry={report.reload}>
          {(r) => (r ? <ReportView r={r} from={from} to={to} /> : <div className="muted">Wybierz użytkownika.</div>)}
        </QueryState>
      </Card>
    </>
  );
}
