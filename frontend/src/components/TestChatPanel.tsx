import { useState } from 'react';
import { Box, Typography, Card, CardContent, TextField, IconButton, Stack, Chip, CircularProgress } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToyOutlined';
import { useTestChat } from '../hooks';
import PageHeader from './PageHeader';

type Msg = { role: 'user' | 'bot'; text: string; escalate?: boolean; model?: string };

export default function TestChatPanel({ agentId }: { agentId: number }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const testChat = useTestChat(agentId);

  const send = async () => {
    const text = input.trim();
    if (!text || testChat.isPending) return;
    setMsgs(m => [...m, { role: 'user', text }]);
    setInput('');
    try {
      const res = await testChat.mutateAsync(text);
      setMsgs(m => [...m, { role: 'bot', text: res.reply, escalate: res.escalate, model: res.model }]);
    } catch {
      setMsgs(m => [...m, { role: 'bot', text: 'Gagal memanggil AI.' }]);
    }
  };

  return (
    <Box>
      <PageHeader title="Coba Chat"
        subtitle="Uji jawaban AI di sini tanpa perlu konek WhatsApp. Sempurnakan persona & knowledge dulu sebelum pelanggan asli datang." />
      <Card>
        <CardContent>
          <Box sx={{ minHeight: 300, maxHeight: 430, overflowY: 'auto', mb: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {msgs.length === 0 && (
              <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 5 }}>
                Ketik pesan seperti calon pembeli, lihat bagaimana AI menjawab.
              </Typography>
            )}
            {msgs.map((m, i) => (
              <Box key={i} sx={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                <Box sx={{ px: 1.25, py: 0.75, borderRadius: 1.5, bgcolor: m.role === 'user' ? 'primary.main' : '#eceff1', color: m.role === 'user' ? '#fff' : 'text.primary', whiteSpace: 'pre-wrap', fontSize: '0.88rem', lineHeight: 1.45 }}>
                  {m.text}
                </Box>
                {m.role === 'bot' && m.model && (
                  <Chip icon={<SmartToyIcon sx={{ fontSize: 14 }} />} label={`Dijawab oleh ${m.model}`} size="small" variant="outlined"
                    sx={{ mt: 0.5, height: 20, fontSize: '0.68rem' }} />
                )}
                {m.escalate && <Chip label="Bot ragu, dialihkan ke manusia" size="small" color="warning" sx={{ mt: 0.5, ml: m.model ? 0.5 : 0 }} />}
              </Box>
            ))}
            {testChat.isPending && <CircularProgress size={20} sx={{ alignSelf: 'flex-start', ml: 1 }} />}
          </Box>
          <Stack direction="row" spacing={1}>
            <TextField fullWidth size="small" placeholder="Tulis pesan…" value={input}
              onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
            <IconButton color="primary" onClick={send} disabled={testChat.isPending}><SendIcon /></IconButton>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
