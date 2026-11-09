import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { DevicesPage } from './pages/Devices';
import { DeviceDetailPage } from './pages/DeviceDetail';
import { ControlPage } from './pages/Control';
import { HeatMeterPage } from './pages/HeatMeter';
import { AccessPage } from './pages/Access';
import { UsersPage } from './pages/Users';
import { AutomationsPage } from './pages/Automations';
import { HistoryPage } from './pages/History';
import { StatsPage } from './pages/Stats';
import { ReportsPage } from './pages/Reports';
import { NotFoundPage } from './pages/NotFound';

// HashRouter: statyczny build działa z dowolnego backendu bez konfigurowania przekierowań SPA.
function Protected() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

function LoginRoute() {
  const { user } = useAuth();
  return user ? <Navigate to="/" replace /> : <LoginPage />;
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route element={<Protected />}>
              <Route index element={<DashboardPage />} />
              <Route path="devices" element={<DevicesPage />} />
              <Route path="devices/:id" element={<DeviceDetailPage />} />
              <Route path="control" element={<ControlPage />} />
              <Route path="heat-meter" element={<HeatMeterPage />} />
              <Route path="access" element={<AccessPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="automations" element={<AutomationsPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="stats" element={<StatsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </HashRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
