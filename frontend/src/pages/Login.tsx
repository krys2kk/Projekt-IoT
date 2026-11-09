import { useState, type FormEvent } from 'react';
import { Cpu, Loader2, LogIn } from 'lucide-react';
import { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ConnectionBanner } from '../components/ConnectionStatus';

export function LoginPage() {
  const { login } = useAuth();
  const [l, setL] = useState('');
  const [secret, setSecret] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(l.trim(), secret);
    } catch (ex) {
      setErr(errorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <ConnectionBanner />
      <form className="login-card card" onSubmit={submit}>
        <div className="login-brand">
          <span className="brand-logo">
            <Cpu size={22} />
          </span>
          <div>
            <h1 className="glitch" data-text="IoT Pomieszczenie">
              IoT Pomieszczenie
            </h1>
            <p className="muted">Panel systemu monitoringu i kontroli dostępu</p>
          </div>
        </div>
        <label className="field">
          <span className="field-label">Login</span>
          <input value={l} onChange={(e) => setL(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label className="field">
          <span className="field-label">Hasło lub PIN</span>
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="current-password" required />
        </label>
        {err && (
          <div className="form-error" role="alert">
            {err}
          </div>
        )}
        <button className="btn btn-primary btn-block" disabled={busy || !secret || !l}>
          {busy ? <Loader2 size={16} className="spin" /> : <LogIn size={16} />} Zaloguj
        </button>
      </form>
    </div>
  );
}
