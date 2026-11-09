import { Link, useNavigate } from 'react-router-dom';
import { Signal } from 'lucide-react';
import { deviceTypeLabel, powerSourceLabel } from '../config/catalog';
import { useDevices } from '../hooks/useDevices';
import { fmtDateTime, fmtRelative } from '../lib/format';
import { Badge, Card, PageHeader, QueryState } from '../components/ui';
import { BatteryBadge, hasData, OnlineBadge } from '../components/deviceBits';

function Lqi({ value }: { value: unknown }) {
  if (typeof value !== 'number') return <span className="muted">—</span>;
  // LQI 0–255: im wyżej, tym lepsza jakość łącza
  const bars = value > 170 ? 4 : value > 110 ? 3 : value > 60 ? 2 : 1;
  return (
    <span className="lqi" title={`LQI ${value}`}>
      <span className="lqi-bars" aria-hidden>
        {[1, 2, 3, 4].map((b) => (
          <span key={b} className={b <= bars ? 'on' : ''} style={{ height: 3 + b * 3 }} />
        ))}
      </span>
      {value}
    </span>
  );
}

/** F13 — wszystkie urządzenia sieci ZigBee: dostępność, jakość łącza, bateria. */
export function DevicesPage() {
  const devices = useDevices(5000);
  const navigate = useNavigate();

  return (
    <>
      <PageHeader title="Urządzenia" subtitle="Urządzenia ZigBee zarejestrowane w backendzie i moduły własne ESP32-C6" />
      <QueryState data={devices.data} error={devices.error} loading={devices.loading} onRetry={devices.reload}>
        {(list) => (
          <Card
            title={`Urządzenia (${list.length})`}
            icon={<Signal size={16} />}
            subtitle={`${list.filter((d) => d.online).length} online`}
          >
            <div className="table-wrap">
              <table className="table hover">
                <thead>
                  <tr>
                    <th>Urządzenie</th>
                    <th>Typ</th>
                    <th>Zasilanie</th>
                    <th>Status</th>
                    <th>Ostatni raport</th>
                    <th>LQI</th>
                    <th>Bateria</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((d) => (
                    <tr key={d.id} onClick={() => navigate(`/devices/${encodeURIComponent(d.id)}`)} className="clickable">
                      <td>
                        <Link to={`/devices/${encodeURIComponent(d.id)}`} onClick={(e) => e.stopPropagation()}>
                          {d.nazwa}
                        </Link>
                        <div className="muted small mono">{d.id}</div>
                      </td>
                      <td>
                        {deviceTypeLabel(d.typ)}
                        {(d.typ === 'heat_meter' || d.typ === 'access_keypad') && (
                          <>
                            {' '}
                            <Badge tone="info">własny</Badge>
                          </>
                        )}
                      </td>
                      <td>{powerSourceLabel(d.typ)}</td>
                      <td>
                        <OnlineBadge device={d} />
                      </td>
                      <td title={fmtDateTime(d.updated_at)}>{hasData(d) ? fmtRelative(d.updated_at) : <span className="muted">—</span>}</td>
                      <td>
                        <Lqi value={d.last_state.linkquality} />
                      </td>
                      <td>
                        <BatteryBadge device={d} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </QueryState>
    </>
  );
}
