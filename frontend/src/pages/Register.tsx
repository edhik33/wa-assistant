import { useState } from 'react';
import { Box, Card, CardContent, TextField, Button, Typography, Alert, Link } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function Register() {
  const [form, setForm] = useState({ name: '', business_name: '', username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const handleRegister = async () => {
    if (loading) return;
    if (!form.username || !form.password) { setError('Username & password wajib diisi'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/register', form);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      navigate('/app');
    } catch (e: any) {
      setError(e.response?.data?.error || 'Gagal mendaftar');
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5, textAlign: 'center' }}>Mulai Gratis 🚀</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
            Coba 7 hari gratis, tanpa kartu kredit.
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField fullWidth label="Nama Bisnis" value={form.business_name} onChange={set('business_name')} disabled={loading} sx={{ mb: 2 }} />
          <TextField fullWidth label="Nama Kamu" value={form.name} onChange={set('name')} disabled={loading} sx={{ mb: 2 }} />
          <TextField fullWidth label="Username" value={form.username} onChange={set('username')} disabled={loading} sx={{ mb: 2 }} />
          <TextField fullWidth label="Email" type="email" value={form.email} onChange={set('email')} disabled={loading} sx={{ mb: 2 }} />
          <TextField fullWidth label="Password" type="password" value={form.password} onChange={set('password')} disabled={loading}
            sx={{ mb: 3 }} onKeyDown={e => e.key === 'Enter' && handleRegister()} />
          <Button fullWidth variant="contained" onClick={handleRegister} disabled={loading} sx={{ py: 1.5, fontWeight: 700 }}>
            {loading ? 'Mendaftar…' : 'Daftar Sekarang'}
          </Button>
          <Typography variant="body2" sx={{ mt: 2, textAlign: 'center' }}>
            Sudah punya akun? <Link href="/login" underline="hover">Login</Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
