import { useState } from 'react';
import { Box, Card, CardContent, TextField, Button, Typography, Alert } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const res = await api.post('/login', { username, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      navigate('/');
    } catch {
      setError('Username atau password salah');
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f5f5f5' }}>
      <Card sx={{ width: 400 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 3, textAlign: 'center' }}>
            🤖 WA AI Assistant
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField fullWidth label="Username" value={username} onChange={e => setUsername(e.target.value)}
            sx={{ mb: 2 }} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          <TextField fullWidth label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)}
            sx={{ mb: 3 }} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          <Button fullWidth variant="contained" onClick={handleLogin} sx={{ py: 1.5, fontWeight: 700 }}>
            Login
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
