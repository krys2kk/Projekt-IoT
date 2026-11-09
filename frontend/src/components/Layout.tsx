import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Cpu,
  FileText,
  Flame,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  SlidersHorizontal,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import { api } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { usePolling } from '../hooks/usePolling';
import { ConnectionBanner, ConnectionPill, MqttBanner, MqttPill } from './ConnectionStatus';
import { AccessNotifier } from './AccessNotifier';
import { ErrorBoundary } from './ErrorBoundary';
import { fmtDate, fmtTime } from '../lib/format';

const NAV = [
  { to: '/', label: 'Pulpit', icon: LayoutDashboard, end: true },
  { to: '/devices', label: 'Urządzenia', icon: Cpu },
  { to: '/control', label: 'Sterowanie', icon: SlidersHorizontal },
  { to: '/heat-meter', label: 'Ciepłomierz', icon: Flame },
  { to: '/access', label: 'Kontrola dostępu', icon: KeyRound },
  { to: '/users', label: 'Użytkownicy', icon: Users },
  { to: '/automations', label: 'Automatyzacje', icon: Workflow },
  { to: '/history', label: 'Historia', icon: History },
  { to: '/stats', label: 'Statystyki', icon: BarChart3 },
  { to: '/reports', label: 'Raporty', icon: FileText },
];

/** Zegar w stylu HUD (czas lokalny). */
function HudClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <time className="hud-clock only-desktop" dateTime={now.toISOString()}>
      {fmtDate(now)} · {fmtTime(now)}
    </time>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const health = usePolling(() => api.health(), 5000);
  const mqtt = health.error || !health.data ? null : health.data.mqtt_connected;

  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className={`app ${menuOpen ? 'menu-open' : ''}`}>
      <aside className="sidebar" aria-label="Nawigacja">
        <div className="brand">
          <span className="brand-logo" aria-hidden>
            <Cpu size={18} />
          </span>
          <div>
            <div className="brand-name glitch" data-text="IoT Pomieszczenie">
              IoT Pomieszczenie
            </div>
            <div className="brand-sub">// monitoring · kontrola dostępu</div>
          </div>
          <button className="icon-btn only-mobile" onClick={() => setMenuOpen(false)} aria-label="Zamknij menu">
            <X size={18} />
          </button>
        </div>
        <nav className="nav">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn only-mobile" onClick={() => setMenuOpen(true)} aria-label="Otwórz menu">
            <Menu size={20} />
          </button>
          <ConnectionPill />
          <MqttPill connected={mqtt} />
          <div className="topbar-spacer" />
          <HudClock />
          {user && (
            <div className="user-chip">
              <span className="avatar" aria-hidden>
                {user.login.slice(0, 2).toUpperCase()}
              </span>
              <span className="user-name">{user.login}</span>
              <button className="icon-btn" onClick={logout} title="Wyloguj" aria-label="Wyloguj">
                <LogOut size={18} />
              </button>
            </div>
          )}
        </header>
        <ConnectionBanner />
        {mqtt === false && <MqttBanner />}
        <main className="content">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <AccessNotifier />
    </div>
  );
}
