import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, KeyRound } from 'lucide-react';
import { api, MAX_ROWS } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { AccessResult } from '../api/types';
import { ACCESS_RESULT_LABELS, ACCESS_RESULT_LED, ACCESS_RESULTS, ACCESS_TIMEOUT_LED, DEVICE_IDS } from '../config/catalog';
import { usePolling } from '../hooks/usePolling';
import { useToast } from '../context/ToastContext';
import { downloadText, fileStamp, toCsv } from '../lib/download';
import { fmtDateTime, fmtRelative, fmtTime } from '../lib/format';
import { presetRange, rangeQuery, refreshRange, type TimeRange } from '../lib/time';
import { Card, PageHeader, Pagination, QueryState, StatTile } from '../components/ui';
import { TimeRangePicker } from '../components/TimeRangePicker';
import { AccessResultBadge, AccessResultIcon, Led, OnlineBadge, TimeoutBadge } from '../components/deviceBits';

const PAGE = 15;

const RESULT_HINT: Record<AccessResult, string> = {
  ACCESS_GRANTED: 'PIN poprawny, konto aktywne, rola z dostępem',
  INVALID_PIN: 'PIN nie pasuje do żadnego użytkownika',
  FORBIDDEN: 'PIN poprawny, ale konto zablokowane lub rola bez dostępu',
};

/** F6 — kontrola dostępu: wynik weryfikacji PIN na serwerze, sygnalizacja kolorem i komunikatem. */
export function AccessPage() {
  const toast = useToast();
  const [range, setRange] = useState<TimeRange>(() => presetRange('today'));
  const [filter, setFilter] = useState<AccessResult | ''>('');
  const [page, setPage] = useState(0);
  const keypad = usePolling(() => api.device(DEVICE_IDS.access), 5000);
  const latest = usePolling(() => api.accessAttempts({ limit: 1 }), 2000);
  const list = usePolling(() => api.accessAttempts({ ...rangeQuery(refreshRange(range)), limit: MAX_ROWS }), 4000, [range]);

  const counts = useMemo(() => {
    const c: Record<AccessResult, number> = { ACCESS_GRANTED: 0, INVALID_PIN: 0, FORBIDDEN: 0 };
    for (const a of list.data ?? []) if (a.wynik in c) c[a.wynik]++;
    return c;
  }, [list.data]);

  const last = latest.data?.[0];
  const fresh = last ? Date.now() - new Date(last.ts).getTime() < 8000 : false;
  // Backend nie filtruje po wyniku — filtr działa po stronie aplikacji.
  const rows = useMemo(() => (list.data ?? []).filter((a) => !filter || a.wynik === filter), [list.data, filter]);

  async function exportCsv() {
    try {
      if (filter) {
        const csv = toCsv(
          ['id', 'user_id', 'user_login', 'device_id', 'wynik', 'kod_decyzji', 'ts'],
          rows.map((a) => [a.id, a.user_id ?? '', a.user_login ?? 'unknown', a.device_id, a.wynik, a.kod_decyzji, a.ts]),
        );
        downloadText(`proby-dostepu-${filter}-${fileStamp()}.csv`, csv);
        return;
      }
      const csv = await api.exportCsv({ dataset: 'access_attempts', ...rangeQuery(refreshRange(range)) });
      downloadText(`proby-dostepu-${fileStamp()}.csv`, csv);
    } catch (e) {
      toast.error('Eksport nie powiódł się', errorMessage(e));
    }
  }

  const pageCount = Math.ceil(rows.length / PAGE);
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <>
      <PageHeader
        title="Kontrola dostępu"
        subtitle="Moduł własny ESP32-C6 z klawiaturą 4×4 — PIN weryfikowany na serwerze, wynik sygnalizowany diodą RGB i komunikatem"
        actions={keypad.data && <OnlineBadge device={keypad.data} />}
      />

      <div className="grid-2 grid-wide-right">
        <Card title="Ostatnia próba" icon={<KeyRound size={16} />}>
          {last ? (
            <div className="last-attempt" style={{ ['--led' as string]: ACCESS_RESULT_LED[last.wynik]?.color }}>
              <Led result={last.wynik} size={72} pulse={fresh} />
              <div>
                <div className="last-attempt-title">
                  <AccessResultIcon result={last.wynik} size={22} /> {ACCESS_RESULT_LABELS[last.wynik] ?? last.wynik}
                </div>
                <div className="last-attempt-user">{last.user_login ?? 'Nieznany kod PIN'}</div>
                <div className="muted small">
                  {fmtTime(last.ts)} · {fmtRelative(last.ts)} · {last.device_id}
                </div>
              </div>
            </div>
          ) : (
            <div className="muted">{latest.error ? errorMessage(latest.error) : 'Brak prób dostępu.'}</div>
          )}
        </Card>

        <Card title="Sygnalizacja wyników">
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Wynik / dioda</th>
                  <th>Kod</th>
                  <th>Znaczenie</th>
                </tr>
              </thead>
              <tbody>
                {ACCESS_RESULTS.map((r, i) => (
                  <tr key={r}>
                    <td className="nowrap">
                      <AccessResultBadge result={r} />
                      <div className="muted small">dioda: {ACCESS_RESULT_LED[r].name}</div>
                    </td>
                    <td className="mono" title="kod_decyzji">
                      {i + 1}
                    </td>
                    <td className="small">{RESULT_HINT[r]}</td>
                  </tr>
                ))}
                <tr>
                  <td className="nowrap">
                    <TimeoutBadge color={ACCESS_TIMEOUT_LED.color} />
                    <div className="muted small">dioda: {ACCESS_TIMEOUT_LED.name}</div>
                  </td>
                  <td className="mono">—</td>
                  <td className="small">Sygnalizuje sam moduł po 3 s bez decyzji serwera; serwer nie zapisuje takiej próby</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="stats-grid">
        {ACCESS_RESULTS.map((r) => (
          <StatTile
            key={r}
            label={ACCESS_RESULT_LABELS[r]}
            icon={
              <span style={{ color: ACCESS_RESULT_LED[r].color, display: 'inline-flex' }}>
                <AccessResultIcon result={r} size={16} />
              </span>
            }
            value={counts[r]}
            sub="w wybranym zakresie"
          />
        ))}
      </div>

      <Card
        title="Rejestr prób dostępu"
        actions={
          <>
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as AccessResult | '');
                setPage(0);
              }}
              aria-label="Filtr wyniku"
            >
              <option value="">Wszystkie wyniki</option>
              {ACCESS_RESULTS.map((r) => (
                <option key={r} value={r}>
                  {ACCESS_RESULT_LABELS[r]}
                </option>
              ))}
            </select>
            <TimeRangePicker
              value={range}
              onChange={(r) => {
                setRange(r);
                setPage(0);
              }}
            />
            <button className="btn btn-sm" onClick={() => void exportCsv()}>
              <Download size={14} /> CSV
            </button>
          </>
        }
      >
        <QueryState data={list.data} error={list.error} loading={list.loading} onRetry={list.reload} empty={() => rows.length === 0}>
          {() => (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Czas</th>
                      <th>Wynik</th>
                      <th>Użytkownik</th>
                      <th>Urządzenie</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((a) => (
                      <tr key={a.id}>
                        <td>{fmtDateTime(a.ts)}</td>
                        <td>
                          <AccessResultBadge result={a.wynik} />
                        </td>
                        <td className="mono small">{a.user_login ?? <span className="muted">nieznany kod</span>}</td>
                        <td className="mono small">{a.device_id}</td>
                        <td>
                          {a.user_id && (
                            <Link to={`/reports?user=${a.user_id}`} className="link-btn small">
                              raport
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={Math.min(page, Math.max(0, pageCount - 1))} pageCount={pageCount} onPage={setPage} total={rows.length} />
            </>
          )}
        </QueryState>
      </Card>
    </>
  );
}
