import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Dashboard from './pages/Dashboard';
import AdminLayout from './pages/admin/AdminLayout';
import AdminOverview from './pages/admin/AdminOverview';
import AdminPlans from './pages/admin/AdminPlans';
import AdminTenants from './pages/admin/AdminTenants';
import theme from './theme';
import MetaPixelTracker from './components/MetaPixelTracker';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" />;
  return <>{children}</>;
}

// GuestRoute: halaman khusus tamu (login/daftar). Kalau sudah login, lempar ke dashboard.
function GuestRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (token) {
    let isAdmin = false;
    try { isAdmin = !!JSON.parse(localStorage.getItem('user') || '{}')?.is_super_admin; } catch { /* token tanpa user tersimpan */ }
    return <Navigate to={isAdmin ? '/admin' : '/app'} replace />;
  }
  return <>{children}</>;
}

function HomeRoute() {
  const token = localStorage.getItem('token');
  if (token) {
    let isAdmin = false;
    try { isAdmin = !!JSON.parse(localStorage.getItem('user') || '{}')?.is_super_admin; } catch { /* token tanpa user tersimpan */ }
    return <Navigate to={isAdmin ? '/admin' : '/app'} replace />;
  }
  return <Landing />;
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <MetaPixelTracker />
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
          <Route path="/daftar" element={<GuestRoute><Register /></GuestRoute>} />
          <Route path="/lupa-password" element={<ForgotPassword />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />

          {/* Panel operator platform (super admin) */}
          <Route path="/admin" element={<PrivateRoute><AdminLayout /></PrivateRoute>}>
            <Route index element={<AdminOverview />} />
            <Route path="plans" element={<AdminPlans />} />
            <Route path="tenants" element={<AdminTenants />} />
          </Route>

          {/* Aplikasi tenant (pelanggan) */}
          <Route path="/app/*" element={<PrivateRoute><Dashboard /></PrivateRoute>} />

          {/* Fallback: arahkan ke landing */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
