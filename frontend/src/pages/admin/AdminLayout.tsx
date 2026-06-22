import { Box, Paper, Typography, Button, Avatar } from '@mui/material';
import { NavLink, Outlet, Navigate, useNavigate } from 'react-router-dom';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PaymentsIcon from '@mui/icons-material/Payments';
import GroupsIcon from '@mui/icons-material/Groups';
import LogoutIcon from '@mui/icons-material/Logout';
import { currentUser } from '../../types';

const NAV = [
  { to: '/admin', label: 'Ringkasan', icon: <DashboardIcon fontSize="small" />, end: true },
  { to: '/admin/plans', label: 'Plans', icon: <PaymentsIcon fontSize="small" />, end: false },
  { to: '/admin/tenants', label: 'Tenant', icon: <GroupsIcon fontSize="small" />, end: false },
];

export default function AdminLayout() {
  const user = currentUser();
  const navigate = useNavigate();
  if (!user?.is_super_admin) return <Navigate to="/login" replace />;

  const logout = () => { localStorage.clear(); navigate('/login'); };

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, minHeight: '100vh', bgcolor: '#f0f2f5' }}>
      <Paper sx={{ width: { xs: '100%', md: 240 }, borderRadius: 0, p: 2, display: 'flex', flexDirection: { xs: 'row', md: 'column' }, alignItems: { xs: 'center', md: 'stretch' }, gap: { xs: 1, md: 0 }, flexWrap: 'wrap' }}>
        <Box sx={{ mb: { xs: 0, md: 2 }, mr: { xs: 1, md: 0 }, textAlign: 'center' }}>
          <Avatar sx={{ width: 40, height: 40, mx: 'auto', mb: 0.5, bgcolor: '#1565c0', display: { xs: 'none', sm: 'flex' } }}>A</Avatar>
          <Typography sx={{ fontWeight: 700, fontSize: { xs: 14, md: 16 } }}>Admin Platform</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>{user.name || user.username}</Typography>
        </Box>
        {NAV.map(n => (
          <Button key={n.to} component={NavLink} to={n.to} end={n.end} startIcon={n.icon}
            sx={{
              mb: 0.5, justifyContent: { xs: 'center', md: 'flex-start' }, textTransform: 'none',
              '&.active': { bgcolor: 'primary.main', color: '#fff' },
            }}>
            {n.label}
          </Button>
        ))}
        <Box sx={{ flex: 1, display: { xs: 'none', md: 'block' } }} />
        <Button startIcon={<LogoutIcon />} onClick={logout} color="error" sx={{ textTransform: 'none', ml: { xs: 'auto', md: 0 } }}>Logout</Button>
      </Paper>
      <Box sx={{ flex: 1, p: { xs: 2, md: 3 }, overflow: 'auto', width: '100%', boxSizing: 'border-box' }}>
        <Outlet />
      </Box>
    </Box>
  );
}
