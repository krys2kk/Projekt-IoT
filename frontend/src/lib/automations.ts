import type { AutomationAction, AutomationTrigger } from '../api/types';

/** Czytelny zapis warunku reguły backendu, np. „przycisk: action == "single"”. */
export function formatCondition(t: AutomationTrigger | null | undefined): string {
  if (!t) return '—';
  const field = t.field ?? t.metric ?? 'action';
  return `${t.device_id ?? '?'}: ${field} ${t.op ?? '=='} ${JSON.stringify(t.value)}`;
}

export function formatCommand(command: Record<string, unknown> | undefined): string {
  if (!command) return '—';
  return Object.entries(command)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(', ');
}

export function formatAction(a: AutomationAction | null | undefined): string {
  if (!a) return '—';
  return `${a.device_id ?? '?'}: ${formatCommand(a.command)}`;
}
