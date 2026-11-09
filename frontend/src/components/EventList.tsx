import { Activity, Bell, KeyRound, MousePointerClick, Radar, Send, type LucideIcon } from 'lucide-react';
import type { Device, IoTEvent } from '../api/types';
import { eventTypeLabel } from '../config/catalog';
import { describeEvent, eventTone } from '../lib/events';
import { fmtDateTime, fmtRelative } from '../lib/format';

const ICONS: Record<string, LucideIcon> = {
  action: MousePointerClick,
  occupancy: Radar,
  vibration_alarm: Bell,
  access_attempt: KeyRound,
  command_sent: Send,
};

export function EventList({ events, devices, compact }: { events: IoTEvent[]; devices?: Device[]; compact?: boolean }) {
  const name = (id: string) => devices?.find((d) => d.id === id)?.nazwa ?? id;
  return (
    <ul className={`event-list ${compact ? 'compact' : ''}`}>
      {events.map((e) => {
        const Icon = ICONS[e.typ] ?? Activity;
        return (
          <li key={e.id} className={`event tone-${eventTone(e)}`}>
            <span className="event-icon">
              <Icon size={15} />
            </span>
            <div className="event-text">
              <div>{describeEvent(e)}</div>
              <div className="muted small">
                {eventTypeLabel(e.typ)} · {name(e.device_id)}
              </div>
            </div>
            <time className="muted small" dateTime={e.ts} title={fmtDateTime(e.ts)}>
              {compact ? fmtRelative(e.ts) : fmtDateTime(e.ts)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
