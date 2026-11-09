import { Lightbulb, Plug, Zap } from 'lucide-react';
import { api, MAX_MEASUREMENTS } from '../api/endpoints';
import { DEVICE_IDS } from '../config/catalog';
import { usePolling } from '../hooks/usePolling';
import { useDevices } from '../hooks/useDevices';
import { presetRange, rangeQuery } from '../lib/time';
import { toTimePoints } from '../lib/series';
import { Card, PageHeader, QueryState } from '../components/ui';
import { SERIES, TimeSeriesChart } from '../components/charts';
import { PowerStripControl } from '../components/controls/PowerStripControl';
import { BulbControl } from '../components/controls/BulbControl';
import { OnlineBadge } from '../components/deviceBits';

/** F4 + F5 — sterowanie listwą i oświetleniem z aplikacji. */
export function ControlPage() {
  const devices = useDevices(3000);
  const strip = devices.byId(DEVICE_IDS.strip);
  const bulb = devices.byId(DEVICE_IDS.bulb);
  const power = usePolling(() => {
    const r = presetRange('1h');
    return api.measurements({ device_id: DEVICE_IDS.strip, metric: 'power', ...rangeQuery(r), limit: MAX_MEASUREMENTS });
  }, 10_000);

  return (
    <>
      <PageHeader title="Sterowanie" subtitle="Odbiorniki: listwa NOUS A11Z (3 gniazda + pomiar energii) i żarówka NOUS P3Z (RGB, CCT, efekty)" />
      <QueryState data={devices.data} error={devices.error} loading={devices.loading} onRetry={devices.reload}>
        {() => (
          <div className="grid-2">
            <div className="stack">
              {strip && (
                <Card title="Listwa zasilająca" icon={<Plug size={16} />} subtitle={strip.id} actions={<OnlineBadge device={strip} />}>
                  <PowerStripControl device={strip} onUpdate={devices.update} />
                </Card>
              )}
              <Card title="Moc pobierana przez listwę — ostatnia godzina" icon={<Zap size={16} />}>
                <QueryState data={power.data} error={power.error} loading={power.loading} empty={(x) => x.length === 0}>
                  {(ms) => (
                    <TimeSeriesChart
                      height={200}
                      data={toTimePoints(ms, ['power']).points}
                      series={[{ key: 'power', label: 'Moc', color: SERIES[0], unit: 'W', decimals: 0 }]}
                    />
                  )}
                </QueryState>
              </Card>
            </div>
            {bulb && (
              <Card title="Oświetlenie" icon={<Lightbulb size={16} />} subtitle={bulb.id} actions={<OnlineBadge device={bulb} />}>
                <BulbControl device={bulb} onUpdate={devices.update} />
              </Card>
            )}
          </div>
        )}
      </QueryState>
    </>
  );
}
