import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import AdminLayout from './pages/admin/AdminLayout';
import AdminOverview from './pages/admin/AdminOverview';
import AdminPlans from './pages/admin/AdminPlans';
import AdminTenants from './pages/admin/AdminTenants';
import theme from './theme';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/daftar" element={<Register />} />

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
