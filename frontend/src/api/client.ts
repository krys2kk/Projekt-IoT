import { connectionStore } from './connection';
import type { ApiErrorBody } from './types';

/** Klient HTTP backendu FastAPI. Panel jest serwowany przez backend, więc adresy są względne. */

const DEFAULT_TIMEOUT_MS = 15000;
const TOKEN_KEY = 'iot.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

let token: string | null = readToken();
let unauthorizedHandler: (() => void) | null = null;

export function getToken() {
  return token;
}

export function setToken(next: string | null) {
  token = next;
  try {
    if (next) localStorage.setItem(TOKEN_KEY, next);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* brak dostępu do storage — token zostaje tylko w pamięci */
  }
}

export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export function buildUrl(path: string, query?: Query) {
  const params = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      params.set(k, String(v));
    }
  }
  const qs = params.toString();
  return `${path}${qs ? `?${qs}` : ''}`;
}

interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** Zwróć surowy tekst (np. CSV) zamiast JSON. */
  raw?: boolean;
  timeoutMs?: number;
}

interface RawResponse {
  status: number;
  body: string;
}

async function send(method: string, url: string, opts: RequestOptions): Promise<RawResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: opts.raw ? 'text/csv, */*' : 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

function parseError(status: number, body: string): ApiError | null {
  try {
    const parsed = JSON.parse(body) as Partial<ApiErrorBody> & { detail?: unknown };
    if (parsed?.error?.code) return new ApiError(status, parsed.error.code, parsed.error.message ?? parsed.error.code);
    // Format domyślny Starlette (np. 404 z plików statycznych).
    if (parsed?.detail !== undefined) {
      return new ApiError(status, `HTTP_${status}`, typeof parsed.detail === 'string' ? parsed.detail : 'Błąd żądania');
    }
  } catch {
    /* treść nie jest JSON-em */
  }
  return null;
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, opts.query);
  let res: RawResponse;
  try {
    res = await send(method, url, opts);
  } catch (e) {
    connectionStore.reportFailure();
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    throw new ApiError(
      0,
      aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
      aborted ? 'Serwer nie odpowiedział w wymaganym czasie' : 'Brak połączenia z serwerem',
    );
  }

  if (res.status >= 400) {
    const err = parseError(res.status, res.body);
    if (!err && res.status >= 500) {
      // Odpowiedź spoza formatu backendu (np. proxy 500/502/504) => backend niedostępny.
      connectionStore.reportFailure();
      throw new ApiError(res.status, 'SERVER_UNAVAILABLE', `Serwer niedostępny (HTTP ${res.status})`);
    }
    connectionStore.reportSuccess();
    if (res.status === 401 && path !== '/api/auth/login') unauthorizedHandler?.();
    throw err ?? new ApiError(res.status, `HTTP_${res.status}`, `Błąd serwera (HTTP ${res.status})`);
  }

  connectionStore.reportSuccess();
  if (opts.raw) return res.body as T;
  if (!res.body) return undefined as T;
  try {
    return JSON.parse(res.body) as T;
  } catch {
    throw new ApiError(res.status, 'BAD_RESPONSE', 'Niepoprawna odpowiedź serwera');
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Nieznany błąd';
}
