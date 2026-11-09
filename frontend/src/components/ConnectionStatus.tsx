import { useSyncExternalStore } from 'react';
import { RadioTower, RefreshCw, ServerCrash } from 'lucide-react';
import { connectionStore } from '../api/connection';
import { fmtTime } from '../lib/format';

function useConnection() {
  return useSyncExternalStore(connectionStore.subscribe, connectionStore.getSnapshot);
}

/** Baner F14 — brak odpowiedzi serwera. Aplikacja działa dalej na ostatnich danych i ponawia żądania. */
export function ConnectionBanner() {
  const c = useConnection();
  if (c.online) return null;
  return (
    <div className="conn-banner" role="alert">
      <ServerCrash size={18} />
      <div>
        <strong>Brak połączenia z serwerem.</strong> Wyświetlane dane mogą być nieaktualne
        {c.lastSuccess ? ` (ostatnia synchronizacja: ${fmtTime(c.lastSuccess)})` : ''}. Ponawiam automatycznie…
      </div>
      <RefreshCw size={16} className="spin" aria-hidden />
    </div>
  );
}

/** Serwer odpowiada, ale nie ma połączenia z brokerem — brak nowych odczytów i sterowania. */
export function MqttBanner() {
  return (
    <div className="conn-banner" role="alert">
      <RadioTower size={18} />
      <div>
        <strong>Backend nie ma połączenia z brokerem MQTT.</strong> Odczyty nie będą się aktualizować, a polecenia nie dotrą
        do urządzeń.
      </div>
    </div>
  );
}

export function ConnectionPill() {
  const c = useConnection();
  return (
    <span className={`conn-pill ${c.online ? 'ok' : 'err'}`} title={c.lastSuccess ? `Ostatnia odpowiedź: ${fmtTime(c.lastSuccess)}` : ''}>
      <span className="dot" />
      <span className="conn-long">{c.online ? 'Połączono z serwerem' : 'Serwer niedostępny'}</span>
      <span className="conn-short">{c.online ? 'Online' : 'Offline'}</span>
    </span>
  );
}

/** Stan połączenia backendu z brokerem MQTT (null = nieznany, bo serwer nie odpowiada). */
export function MqttPill({ connected }: { connected: boolean | null }) {
  if (connected === null) return null;
  return (
    <span className={`conn-pill ${connected ? 'ok' : 'err'}`}>
      <span className="dot" />
      MQTT {connected ? 'OK' : 'brak'}
    </span>
  );
}
