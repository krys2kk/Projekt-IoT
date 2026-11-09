// Globalny stan połączenia z backendem (F14 — brak odpowiedzi serwera).
// Klient HTTP raportuje tu każdy sukces/porażkę, a baner w UI subskrybuje zmiany.

export interface ConnectionState {
  online: boolean;
  lastSuccess: number | null;
  lastFailure: number | null;
  consecutiveFailures: number;
}

let state: ConnectionState = {
  online: true,
  lastSuccess: null,
  lastFailure: null,
  consecutiveFailures: 0,
};

const listeners = new Set<() => void>();
let lastEmit = 0;

function set(next: ConnectionState, force = false) {
  const changedStatus = next.online !== state.online;
  state = next;
  const now = Date.now();
  // Nie przerysowujemy UI przy każdym udanym żądaniu — wystarczy raz na sekundę.
  if (force || changedStatus || now - lastEmit > 1000) {
    lastEmit = now;
    listeners.forEach((l) => l());
  }
}

export const connectionStore = {
  getSnapshot: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  reportSuccess() {
    set({ online: true, lastSuccess: Date.now(), lastFailure: state.lastFailure, consecutiveFailures: 0 });
  },
  reportFailure() {
    const failures = state.consecutiveFailures + 1;
    // Jedno nieudane żądanie może być przypadkiem — offline ogłaszamy po drugim z rzędu.
    set(
      { online: failures < 2, lastSuccess: state.lastSuccess, lastFailure: Date.now(), consecutiveFailures: failures },
      true,
    );
  },
};
