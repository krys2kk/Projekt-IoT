import { request } from './client';
import type {
  AccessAttempt,
  Automation,
  CommandResponse,
  Device,
  ExportDataset,
  Health,
  IoTEvent,
  LoginResponse,
  Measurement,
  MeasurementAgg,
  NewUser,
  Stats,
  User,
  UserPatch,
  UserReport,
} from './types';

const enc = encodeURIComponent;

export interface RangeQuery {
  from?: string;
  to?: string;
}

/** Maksymalne wartości parametru limit akceptowane przez backend. */
export const MAX_MEASUREMENTS = 10000;
export const MAX_ROWS = 5000;

export const api = {
  health: () => request<Health>('GET', '/api/health'),

  /** Sekret trafia w oba pola: backend sprawdza hasło, a następnie PIN. */
  login: (login: string, secret: string) =>
    request<LoginResponse>('POST', '/api/auth/login', { body: { login, password: secret, pin: secret } }),

  devices: () => request<Device[]>('GET', '/api/devices'),
  device: (id: string) => request<Device>('GET', `/api/devices/${enc(id)}`),
  /** Pole „payload” przechodzi do MQTT bez zmian, więc obsługuje wszystkie właściwości urządzeń. */
  command: (id: string, payload: Record<string, unknown>) =>
    request<CommandResponse>('POST', `/api/devices/${enc(id)}/commands`, { body: { payload } }),

  /** Dla agg=raw backend zwraca najnowsze pomiary (malejąco po czasie). */
  measurements: (q: { device_id: string; metric?: string; agg?: MeasurementAgg; limit?: number } & RangeQuery) =>
    request<Measurement[]>('GET', '/api/measurements', { query: { ...q } }),
  events: (q: { type?: string; device_id?: string; limit?: number } & RangeQuery = {}) =>
    request<IoTEvent[]>('GET', '/api/events', { query: { ...q } }),

  automations: () => request<Automation[]>('GET', '/api/automations'),
  setAutomationEnabled: (id: number, aktywna: boolean) =>
    request<Automation>('POST', `/api/automations/${id}/enable`, { body: { aktywna } }),

  users: () => request<User[]>('GET', '/api/users'),
  createUser: (u: NewUser) => request<User>('POST', '/api/users', { body: u }),
  updateUser: (id: number, patch: UserPatch) => request<User>('PATCH', `/api/users/${id}`, { body: patch }),
  deleteUser: (id: number) => request<{ status: string; user_id: number }>('DELETE', `/api/users/${id}`),

  accessAttempts: (q: { user_id?: number; limit?: number } & RangeQuery = {}) =>
    request<AccessAttempt[]>('GET', '/api/access/attempts', { query: { ...q } }),
  userReport: (id: number, q: RangeQuery) => request<UserReport>('GET', `/api/reports/user/${id}`, { query: { ...q } }),

  exportCsv: (q: { dataset: ExportDataset; device_id?: string; user_id?: number } & RangeQuery) =>
    request<string>('GET', '/api/export', { query: { ...q }, raw: true, timeoutMs: 30000 }),
  stats: (q: { device_id: string; metric: string; period?: 'day' | 'hour' } & RangeQuery) =>
    request<Stats>('GET', '/api/stats', { query: { period: 'day', ...q } }),
};
