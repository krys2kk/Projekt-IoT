import type { AccessResult } from '../api/types';

// Metadane sprzętu i etykiety UI. Klucze właściwości są takie jak w payloadach Zigbee2MQTT,
// a nazwy wielkości takie, jak zapisuje je backend (mqtt_service.py).

/** Stałe device_id urządzeń zakładanych przez backend. */
export const DEVICE_IDS = {
  env: 'czujnik_temperatury',
  occupancy: 'czujnik_obecnosci',
  vibration: 'czujnik_wibracji',
  button: 'przycisk',
  remote: 'pilot',
  strip: 'listwa',
  bulb: 'zarowka_rgb',
  access: 'access_1',
  heat: 'heat_meter_1',
} as const;

export interface MetricDef {
  key: string;
  label: string;
  unit: string;
  decimals: number;
  /** Zakres wiarygodności — wartość spoza zakresu = błędny pomiar (F14). */
  min?: number;
  max?: number;
  binary?: boolean;
  /** Licznik narastający (energia) — zużycie = przyrost w okresie. */
  cumulative?: boolean;
}

const BATTERY: MetricDef = { key: 'battery', label: 'Bateria', unit: '%', decimals: 0, min: 0, max: 100 };

const DEVICE_METRICS: Record<string, MetricDef[]> = {
  env_sensor: [
    { key: 'temperature', label: 'Temperatura', unit: '°C', decimals: 1, min: -20, max: 60 },
    { key: 'humidity', label: 'Wilgotność', unit: '%', decimals: 1, min: 0, max: 100 },
    BATTERY,
  ],
  occupancy_sensor: [{ key: 'occupancy', label: 'Obecność', unit: '', decimals: 0, binary: true }],
  vibration_sensor: [{ key: 'vibration', label: 'Alarm wibracji', unit: '', decimals: 0, binary: true }],
  power_strip: [
    { key: 'power', label: 'Moc', unit: 'W', decimals: 0, min: 0, max: 3680 },
    { key: 'voltage', label: 'Napięcie', unit: 'V', decimals: 1, min: 180, max: 260 },
    { key: 'current', label: 'Prąd', unit: 'A', decimals: 2, min: 0, max: 16 },
    { key: 'energy', label: 'Energia', unit: 'kWh', decimals: 3, min: 0, cumulative: true },
  ],
  heat_meter: [
    { key: 'temperature_1', label: 'Temp. zasilania', unit: '°C', decimals: 1, min: 0, max: 100 },
    { key: 'temperature_2', label: 'Temp. powrotu', unit: '°C', decimals: 1, min: 0, max: 100 },
    { key: 'flow', label: 'Przepływ', unit: 'l/min', decimals: 2, min: 0, max: 30 },
    { key: 'power', label: 'Moc cieplna', unit: 'W', decimals: 0, min: 0, max: 20000 },
    { key: 'energy', label: 'Energia cieplna', unit: 'kWh', decimals: 3, min: 0, cumulative: true },
    BATTERY,
    { key: 'voltage', label: 'Napięcie baterii', unit: 'mV', decimals: 0, min: 2000, max: 4400 },
  ],
  button: [BATTERY, { key: 'voltage', label: 'Napięcie', unit: 'mV', decimals: 0, min: 2000, max: 3400 }],
  remote: [BATTERY, { key: 'voltage', label: 'Napięcie', unit: 'mV', decimals: 0, min: 2000, max: 3400 }],
};

export function metricsFor(typ: string): MetricDef[] {
  return DEVICE_METRICS[typ] ?? [];
}

export function metricDef(typ: string, key: string): MetricDef | undefined {
  return metricsFor(typ).find((m) => m.key === key);
}

/** F14 — czy wartość jest wiarygodna (np. DS18B20 zwraca -127 °C przy rozłączeniu). */
export function isPlausible(def: MetricDef | undefined, value: unknown): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (!def) return true;
  if (def.min !== undefined && value < def.min) return false;
  if (def.max !== undefined && value > def.max) return false;
  return true;
}

const DEVICE_TYPE_LABELS: Record<string, string> = {
  env_sensor: 'Czujnik temperatury i wilgotności',
  occupancy_sensor: 'Czujnik obecności (radar)',
  vibration_sensor: 'Czujnik wibracji z syreną',
  button: 'Przycisk bezprzewodowy',
  remote: 'Pilot 4-przyciskowy',
  power_strip: 'Listwa zasilająca 3×',
  rgb_bulb: 'Żarówka RGB',
  access_keypad: 'Moduł kontroli dostępu (własny)',
  heat_meter: 'Ciepłomierz (własny)',
  zigbee_device: 'Urządzenie ZigBee',
};

export function deviceTypeLabel(typ: string) {
  return DEVICE_TYPE_LABELS[typ] ?? typ;
}

const POWER_SOURCES: Record<string, string> = {
  env_sensor: 'Bateria',
  occupancy_sensor: 'USB 5 V',
  vibration_sensor: 'Bateria',
  button: 'Bateria',
  remote: 'Bateria',
  power_strip: 'Sieć 230 V',
  rgb_bulb: 'Sieć 230 V',
  access_keypad: 'USB 5 V',
  heat_meter: 'Bateria',
};

export function powerSourceLabel(typ: string) {
  return POWER_SOURCES[typ] ?? '—';
}

export function isBatteryPowered(typ: string) {
  return POWER_SOURCES[typ] === 'Bateria';
}

/** Role używane przez backend. Odmowę dostępu dają: blocked, guest_no_access, none (access_service.py). */
const FORBIDDEN_ROLES = ['blocked', 'guest_no_access', 'none'];

export const ROLE_OPTIONS = ['admin', 'user', 'guest_no_access'];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  user: 'Użytkownik',
  guest_no_access: 'Gość bez dostępu',
  blocked: 'Zablokowany',
  none: 'Brak roli',
};

export function roleLabel(rola: string) {
  return ROLE_LABELS[rola] ?? rola;
}

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: 'PIN otwiera dostęp do pomieszczenia. Rola wyróżniona w panelu.',
  user: 'PIN otwiera dostęp do pomieszczenia.',
  guest_no_access: 'Poprawny PIN daje wynik „brak uprawnień”.',
};

/** Wynik, jaki backend zwróci dla poprawnego PIN-u tego użytkownika. */
export function expectedAccessResult(u: { aktywny: boolean; rola: string }): AccessResult {
  return u.aktywny && !FORBIDDEN_ROLES.includes(u.rola) ? 'ACCESS_GRANTED' : 'FORBIDDEN';
}

export const ACCESS_RESULTS: AccessResult[] = ['ACCESS_GRANTED', 'INVALID_PIN', 'FORBIDDEN'];

export const ACCESS_RESULT_LABELS: Record<AccessResult, string> = {
  ACCESS_GRANTED: 'Dostęp przyznany',
  INVALID_PIN: 'Błędny kod',
  FORBIDDEN: 'Brak uprawnień',
};

/** Kolory diody RGB modułu kontroli dostępu (sekcja 7.2 założeń). */
export const ACCESS_RESULT_LED: Record<AccessResult, { color: string; name: string }> = {
  ACCESS_GRANTED: { color: '#05ffa1', name: 'zielony' },
  INVALID_PIN: { color: '#ff2a6d', name: 'czerwony' },
  FORBIDDEN: { color: '#ff9e00', name: 'pomarańczowy' },
};

/** Czwarty stan sygnalizuje sam moduł: brak decyzji serwera w 3 s. Backend go nie zapisuje. */
export const ACCESS_TIMEOUT_LED = { color: '#2f9bff', name: 'niebieski' };

const EVENT_TYPE_LABELS: Record<string, string> = {
  action: 'Przycisk / pilot',
  occupancy: 'Obecność',
  vibration_alarm: 'Alarm wibracji',
  access_attempt: 'Próba dostępu',
  command_sent: 'Polecenie',
};

export const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS);

export function eventTypeLabel(typ: string) {
  return EVENT_TYPE_LABELS[typ] ?? typ;
}

export const BUTTON_ACTION_LABELS: Record<string, string> = {
  single: 'pojedyncze',
  double: 'podwójne',
  long: 'długie',
  hold: 'przytrzymanie',
};

export const BUTTON_ACTIONS = ['single', 'double', 'long'] as const;

/** Akcje pilota Moes XH-SY-04Z / Tuya TS0044: 4 przyciski × 3 gesty = 12 scen (F3). */
export const REMOTE_GESTURES = ['single', 'double', 'hold'] as const;

export function describeAction(action: string): string {
  const m = /^(\d)_(single|double|hold)$/.exec(action);
  if (m) return `Przycisk ${m[1]} — ${BUTTON_ACTION_LABELS[m[2]]}`;
  return BUTTON_ACTION_LABELS[action] ? `Naciśnięcie ${BUTTON_ACTION_LABELS[action]}` : action;
}

export const BULB_EFFECTS: { value: string; label: string }[] = [
  { value: 'blink', label: 'Mignięcie' },
  { value: 'breathe', label: 'Oddychanie' },
  { value: 'okay', label: 'Potwierdzenie' },
  { value: 'channel_change', label: 'Zmiana kanału' },
  { value: 'colorloop', label: 'Pętla kolorów' },
  { value: 'stop_colorloop', label: 'Zatrzymaj pętlę' },
  { value: 'finish_effect', label: 'Zakończ efekt' },
  { value: 'stop_effect', label: 'Przerwij efekt' },
];

export const COLOR_TEMP_MIN = 153; // mired (≈ 6500 K)
export const COLOR_TEMP_MAX = 500; // mired (2000 K)
export const BRIGHTNESS_MAX = 254;
