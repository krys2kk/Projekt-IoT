import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Lock, Pencil, Search, Trash2, Unlock, UserPlus } from 'lucide-react';
import { api } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { User, UserPatch } from '../api/types';
import { expectedAccessResult, ROLE_DESCRIPTIONS, ROLE_OPTIONS, roleLabel } from '../config/catalog';
import { usePolling } from '../hooks/usePolling';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { fmtDate } from '../lib/format';
import { Badge, Card, Field, Modal, PageHeader, QueryState } from '../components/ui';
import { AccessResultBadge } from '../components/deviceBits';

interface FormState {
  login: string;
  rola: string;
  pin: string;
  password: string;
  aktywny: boolean;
}

const EMPTY: FormState = { login: '', rola: 'user', pin: '', password: '', aktywny: true };

function UserForm({
  initial,
  editing,
  onSubmit,
  onCancel,
}: {
  initial: FormState;
  editing: boolean;
  onSubmit: (f: FormState) => Promise<void>;
  onCancel: () => void;
}) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));
  const roles = ROLE_OPTIONS.includes(f.rola) ? ROLE_OPTIONS : [...ROLE_OPTIONS, f.rola];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!editing && (f.login.trim().length < 2 || f.login.trim().length > 64)) return setErr('Login musi mieć od 2 do 64 znaków');
    if ((!editing || f.pin) && !/^\d{4}$/.test(f.pin)) return setErr('PIN musi mieć dokładnie 4 cyfry');
    if (!editing && f.password && f.password.length < 4) return setErr('Hasło musi mieć co najmniej 4 znaki');
    setBusy(true);
    try {
      await onSubmit(f);
    } catch (ex) {
      setErr(errorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="form-grid">
        <Field label="Login" hint={editing ? 'Login jest stały' : undefined}>
          <input value={f.login} disabled={editing} onChange={(e) => set('login', e.target.value)} required maxLength={64} autoFocus={!editing} />
        </Field>
        <Field label="Rola" hint={ROLE_DESCRIPTIONS[f.rola]}>
          <select value={f.rola} onChange={(e) => set('rola', e.target.value)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={editing ? 'Nowy PIN (opcjonalnie)' : 'PIN (4 cyfry)'} hint="Musi być inny niż PIN-y pozostałych użytkowników">
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={f.pin}
            onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))}
            required={!editing}
            autoComplete="new-password"
          />
        </Field>
        {!editing && (
          <Field label="Hasło do panelu (opcjonalnie)" hint="Bez hasła logowanie tylko PIN-em">
            <input type="password" value={f.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
          </Field>
        )}
      </div>
      <div className="check-row">
        <label className="check">
          <input type="checkbox" checked={f.aktywny} onChange={(e) => set('aktywny', e.target.checked)} />
          Konto aktywne (odznacz, aby zablokować)
        </label>
      </div>
      {err && (
        <div className="form-error" role="alert">
          {err}
        </div>
      )}
      <div className="modal-foot inline">
        <button type="button" className="btn" onClick={onCancel}>
          Anuluj
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {editing ? 'Zapisz zmiany' : 'Dodaj użytkownika'}
        </button>
      </div>
    </form>
  );
}

/** F7 — zarządzanie użytkownikami: dodawanie, usuwanie, blokowanie, role i uprawnienia. */
export function UsersPage() {
  const toast = useToast();
  const { user: me } = useAuth();
  const users = usePolling(() => api.users(), 10_000);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<{ mode: 'add' } | { mode: 'edit'; user: User } | null>(null);
  const [toDelete, setToDelete] = useState<User | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users.data ?? []).filter((u) => !q || u.login.toLowerCase().includes(q));
  }, [users.data, query]);

  const replace = (u: User) => users.setData((list) => list?.map((x) => (x.id === u.id ? u : x)));

  async function patch(u: User, p: UserPatch, msg: string) {
    setBusy(u.id);
    try {
      const updated = await api.updateUser(u.id, p);
      replace(updated);
      toast.success(msg, `${updated.login} — zmiana obowiązuje od razu przy kolejnej autoryzacji`);
    } catch (e) {
      toast.error('Nie udało się zapisać zmiany', errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function save(f: FormState) {
    if (modal?.mode === 'edit') {
      const p: UserPatch = { rola: f.rola, aktywny: f.aktywny };
      if (f.pin) p.pin = f.pin;
      const updated = await api.updateUser(modal.user.id, p);
      replace(updated);
      toast.success('Zapisano zmiany', updated.login);
    } else {
      const created = await api.createUser({
        login: f.login.trim(),
        pin: f.pin,
        // Jawny null: bez niego backend ustawiłby domyślne, powszechnie znane hasło.
        password: f.password || null,
        rola: f.rola,
        aktywny: f.aktywny,
      });
      users.setData((list) => [...(list ?? []), created]);
      toast.success('Dodano użytkownika', created.login);
    }
    setModal(null);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const u = toDelete;
    setBusy(u.id);
    try {
      await api.deleteUser(u.id);
      users.setData((list) => list?.filter((x) => x.id !== u.id));
      toast.success('Usunięto użytkownika', u.login);
      setToDelete(null);
    } catch (e) {
      toast.error('Nie udało się usunąć', errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Użytkownicy"
        subtitle="Zmiany w panelu natychmiast wpływają na wynik autoryzacji PIN"
        actions={
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}>
            <UserPlus size={16} /> Dodaj użytkownika
          </button>
        }
      />

      <Card
        title={`Lista użytkowników (${users.data?.length ?? 0})`}
        actions={
          <label className="search">
            <Search size={14} />
            <input placeholder="Szukaj…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Szukaj użytkownika" />
          </label>
        }
      >
        <QueryState data={users.data} error={users.error} loading={users.loading} onRetry={users.reload}>
          {() => (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Użytkownik</th>
                    <th>Rola</th>
                    <th>Konto</th>
                    <th>Wynik PIN teraz</th>
                    <th>Utworzono</th>
                    <th className="right">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => {
                    const self = u.id === me?.id;
                    return (
                      <tr key={u.id} className={u.aktywny ? '' : 'row-muted'}>
                        <td>
                          <strong className="mono">{u.login}</strong>
                          {self && <Badge tone="info">Ty</Badge>}
                        </td>
                        <td>
                          <Badge tone={u.rola === 'admin' ? 'info' : 'muted'}>{roleLabel(u.rola)}</Badge>
                        </td>
                        <td>{u.aktywny ? <Badge tone="ok">aktywne</Badge> : <Badge tone="err">zablokowane</Badge>}</td>
                        <td>
                          <AccessResultBadge result={expectedAccessResult(u)} />
                        </td>
                        <td>{fmtDate(u.created_at)}</td>
                        <td className="right nowrap">
                          <button className="icon-btn" title="Edytuj" aria-label={`Edytuj ${u.login}`} onClick={() => setModal({ mode: 'edit', user: u })}>
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-btn"
                            title={u.aktywny ? 'Zablokuj' : 'Odblokuj'}
                            aria-label={u.aktywny ? `Zablokuj ${u.login}` : `Odblokuj ${u.login}`}
                            disabled={self || busy === u.id}
                            onClick={() => void patch(u, { aktywny: !u.aktywny }, u.aktywny ? 'Zablokowano konto' : 'Odblokowano konto')}
                          >
                            {u.aktywny ? <Lock size={16} /> : <Unlock size={16} />}
                          </button>
                          <Link className="icon-btn" title="Raport dostępu" aria-label={`Raport ${u.login}`} to={`/reports?user=${u.id}`}>
                            <FileText size={16} />
                          </Link>
                          <button className="icon-btn danger" title="Usuń" aria-label={`Usuń ${u.login}`} disabled={self} onClick={() => setToDelete(u)}>
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </Card>

      <Card title="Role i uprawnienia">
        <div className="roles">
          {ROLE_OPTIONS.map((r) => (
            <div key={r} className="role">
              <strong>{roleLabel(r)}</strong>
              <div className="muted small">{ROLE_DESCRIPTIONS[r]}</div>
            </div>
          ))}
          <div className="role">
            <strong>Reguła autoryzacji</strong>
            <div className="muted small">
              Dostęp przyznany ⇔ PIN pasuje do użytkownika, konto jest aktywne, a rola ma dostęp. PIN pasujący do konta zablokowanego lub
              roli bez dostępu → „brak uprawnień”; niepasujący → „błędny kod”.
            </div>
          </div>
        </div>
      </Card>

      <Modal open={!!modal} title={modal?.mode === 'edit' ? `Edycja: ${modal.user.login}` : 'Nowy użytkownik'} onClose={() => setModal(null)}>
        {modal && (
          <UserForm
            key={modal.mode === 'edit' ? modal.user.id : 'new'}
            editing={modal.mode === 'edit'}
            initial={modal.mode === 'edit' ? { login: modal.user.login, rola: modal.user.rola, pin: '', password: '', aktywny: modal.user.aktywny } : EMPTY}
            onSubmit={save}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>

      <Modal
        open={!!toDelete}
        title="Usunąć użytkownika?"
        onClose={() => setToDelete(null)}
        footer={
          <>
            <button className="btn" onClick={() => setToDelete(null)}>
              Anuluj
            </button>
            <button className="btn btn-danger" disabled={busy === toDelete?.id} onClick={() => void confirmDelete()}>
              <Trash2 size={14} /> Usuń
            </button>
          </>
        }
      >
        <p>
          Użytkownik <strong>{toDelete?.login}</strong> zostanie usunięty razem z całą historią swoich prób dostępu. Tej operacji nie można
          cofnąć. Jeśli chcesz tylko odebrać dostęp, użyj blokady.
        </p>
      </Modal>
    </>
  );
}
