// Typy odwzorowują schematy backendu (backend/app/schemas/api_schemas.py).
// Znaczniki czasu: UTC, ISO 8601 („2026-11-09T12:00:00Z”). Frontend prezentuje czas lokalny.

export type DeviceType =
  | 'env_sensor'
  | 'occupancy_sensor'
  | 'vibration_sensor'
  | 'button'
  | 'remote'
  | 'power_strip'
  | 'rgb_bulb'
  | 'access_keypad'
  | 'heat_meter'
  | 'zigbee_device';

export interface Device {
  /** Stały identyfikator urządzenia (np. czujnik_temperatury). */
  id: string;
  nazwa: string;
  /** Urządzenia wykryte automatycznie przez backend mają typ „zigbee_device”. */
  typ: DeviceType | (string & {});
  online: boolean;
  mqtt_topic: string | null;
  ieee_address: string | null;
  /** Ostatni stan zgłoszony przez urządzenie (klucze z payloadu Zigbee2MQTT). */
  last_state: Record<string, unknown>;
  updated_at: string | null;
}

export interface CommandResponse {
  /** „sent” = opublikowano w MQTT. Potwierdzenie to zmiana last_state urządzenia. */
  status: 'sent';
  device_id: string;
  mqtt_topic: string;
  command: Record<string, unknown>;
}

export interface Measurement {
  id: number | null;
  device_id: string;
  metric: string;
  value: number;
  unit: string;
  ts: string;
}

export type MeasurementAgg = 'raw' | 'hour' | 'day';

/** Typy zdarzeń zapisywanych przez backend. */
export type EventType = 'action' | 'occupancy' | 'vibration_alarm' | 'access_attempt' | 'command_sent';

export interface IoTEvent {
  id: number;
  device_id: string;
  typ: EventType | (string & {});
  payload: Record<string, unknown>;
  ts: string;
}

export interface StatPoint {
  /** „2026-11-09” dla doby, „2026-11-09T12” dla godziny — wg czasu UTC. */
  period: string;
  min: number;
  max: number;
  avg: number;
  sum: number;
  daily_consumption: number | null;
  count: number;
}

export interface Stats {
  device_id: string;
  metric: string;
  unit: string;
  period: string;
  overall_min: number | null;
  overall_max: number | null;
  overall_avg: number | null;
  overall_sum: number | null;
  series: StatPoint[];
}

export interface AutomationTrigger {
  device_id?: string;
  field?: string;
  metric?: string;
  op?: string;
  value?: unknown;
}

export interface AutomationAction {
  device_id?: string;
  command?: Record<string, unknown>;
}

export interface Automation {
  id: number;
  nazwa: string;
  trigger: AutomationTrigger;
  warunek: AutomationTrigger | null;
  akcja: AutomationAction;
  aktywna: boolean;
}

/** Rola to dowolny tekst; backend odmawia dostępu rolom: blocked, guest_no_access, none. */
export type Role = string;

export interface User {
  id: number;
  login: string;
  rola: Role;
  aktywny: boolean;
  created_at: string;
}

export interface NewUser {
  login: string;
  pin: string;
  /** null = konto bez hasła, logowanie tylko PIN-em. */
  password: string | null;
  rola: Role;
  aktywny: boolean;
}

export interface UserPatch {
  pin?: string;
  rola?: Role;
  aktywny?: boolean;
}

export type AccessResult = 'ACCESS_GRANTED' | 'INVALID_PIN' | 'FORBIDDEN';

export interface AccessAttempt {
  id: number;
  user_id: number | null;
  user_login: string | null;
  device_id: string;
  wynik: AccessResult;
  kod_decyzji: number;
  ts: string;
}

export interface UserReport {
  user: User;
  total_attempts: number;
  granted_count: number;
  denied_wrong_pin_count: number;
  denied_forbidden_count: number;
  last_attempt_ts: string | null;
  attempts: AccessAttempt[];
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user_id: number;
  login: string;
  rola: Role;
}

export interface SessionUser {
  id: number;
  login: string;
  rola: Role;
}

export interface Health {
  status: string;
  mqtt_connected: boolean;
  ts: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export type ExportDataset = 'measurements' | 'events' | 'access_attempts';
