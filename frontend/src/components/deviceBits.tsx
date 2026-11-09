import { Battery, BatteryLow, BatteryMedium, CheckCircle2, Clock, ShieldX, Wifi, WifiOff, XCircle } from 'lucide-react';
import type { AccessResult, Device } from '../api/types';
import { ACCESS_RESULT_LABELS, ACCESS_RESULT_LED, isBatteryPowered } from '../config/catalog';
import { fmtRelative } from '../lib/format';
import { Badge } from './ui';

export function hasData(device: Pick<Device, 'last_state'>) {
  return Object.keys(device.last_state ?? {}).length > 0;
}

export function OnlineBadge({ device }: { device: Pick<Device, 'online' | 'updated_at' | 'last_state'> }) {
  if (!device.online) {
    return (
      <Badge tone="err" icon={<WifiOff size={12} />}>
        offline{hasData(device) ? ` · ${fmtRelative(device.updated_at)}` : ''}
      </Badge>
    );
  }
  if (!hasData(device)) return <Badge tone="warn">brak danych</Badge>;
  return (
    <Badge tone="ok" icon={<Wifi size={12} />}>
      online
    </Badge>
  );
}

export function batteryOf(d: Device): number | null {
  const b = d.last_state.battery;
  if (typeof b === 'number') return b;
  const bs = d.last_state.battery_state;
  if (bs === 'high') return 90;
  if (bs === 'medium') return 50;
  if (bs === 'low') return 15;
  return null;
}

export function BatteryBadge({ device }: { device: Device }) {
  if (!isBatteryPowered(device.typ)) return null;
  const b = batteryOf(device);
  if (b === null) return <span className="muted">—</span>;
  const label = typeof device.last_state.battery === 'number' ? `${b}%` : String(device.last_state.battery_state);
  const tone = b < 20 ? 'err' : b < 40 ? 'warn' : 'muted';
  const Icon = b < 20 ? BatteryLow : b < 60 ? BatteryMedium : Battery;
  return (
    <Badge tone={tone} icon={<Icon size={13} />}>
      {label}
    </Badge>
  );
}

const RESULT_ICON: Record<AccessResult, typeof CheckCircle2> = {
  ACCESS_GRANTED: CheckCircle2,
  INVALID_PIN: XCircle,
  FORBIDDEN: ShieldX,
};

/** Wynik autoryzacji: zawsze kolor + ikona + etykieta (nie sam kolor). */
export function AccessResultBadge({ result }: { result: AccessResult }) {
  const Icon = RESULT_ICON[result] ?? XCircle;
  return (
    <span className="access-badge" style={{ ['--led' as string]: ACCESS_RESULT_LED[result]?.color ?? 'var(--text-muted)' }}>
      <Icon size={14} />
      {ACCESS_RESULT_LABELS[result] ?? result}
    </span>
  );
}

export function AccessResultIcon({ result, size = 18 }: { result: AccessResult; size?: number }) {
  const Icon = RESULT_ICON[result] ?? XCircle;
  return <Icon size={size} />;
}

/** Czwarty stan: sygnalizuje go sam moduł, backend nie ma takiego wyniku. */
export function TimeoutBadge({ color }: { color: string }) {
  return (
    <span className="access-badge" style={{ ['--led' as string]: color }}>
      <Clock size={14} />
      Brak odpowiedzi serwera
    </span>
  );
}

/** Wirtualna dioda RGB modułu dostępu. */
export function Led({ result, size = 56, pulse }: { result: AccessResult | null; size?: number; pulse?: boolean }) {
  const led = result ? ACCESS_RESULT_LED[result] : undefined;
  return (
    <span
      className={`led ${pulse ? 'led-pulse' : ''}`}
      style={{ width: size, height: size, ['--led' as string]: led?.color ?? 'var(--led-off)' }}
      aria-label={led ? `Dioda: ${led.name}` : 'Dioda wyłączona'}
      role="img"
    />
  );
}
