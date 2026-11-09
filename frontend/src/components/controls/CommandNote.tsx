import { AlertTriangle, CheckCircle2, Send } from 'lucide-react';
import type { CommandResult } from '../../hooks/useDeviceCommand';
import { fmtTime } from '../../lib/format';

/** Wynik ostatniego polecenia: potwierdzenie stanu przez urządzenie (F4). */
export function CommandNote({ outcome }: { outcome: { result: CommandResult; at: number } | null }) {
  if (!outcome) return null;
  const { result, at } = outcome;
  if (result === 'confirmed') {
    return (
      <div className="confirm-note">
        <CheckCircle2 size={14} /> Stan potwierdzony przez urządzenie · {fmtTime(at)}
      </div>
    );
  }
  if (result === 'sent') {
    return (
      <div className="confirm-note">
        <Send size={14} /> Polecenie wysłane (urządzenie nie raportuje tej właściwości) · {fmtTime(at)}
      </div>
    );
  }
  return (
    <div className="inline-warn">
      <AlertTriangle size={14} /> Polecenie wysłane, ale urządzenie nie potwierdziło nowego stanu · {fmtTime(at)}
    </div>
  );
}
