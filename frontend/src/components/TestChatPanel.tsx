import { useState, Fragment } from 'react';
import { Box, Typography, Card, CardContent, TextField, IconButton, Stack, Chip, CircularProgress, Alert } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLongOutlined';
import { useTestChat, type ClosingPreview } from '../hooks';
import PageHeader from './PageHeader';

type Msg = { role: 'user' | 'bot'; text: string; escalate?: boolean; model?: string; closing?: ClosingPreview };

// Ubah URL (mis. https://wa.me/62...) di teks jadi tautan yang bisa diklik.
function renderWithLinks(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>{part}</a>
      : <Fragment key={i}>{part}</Fragment>
  );
}

// ClosingCard menampilkan hasil deteksi order (dry-run) di simulator: apa yang AKAN tercatat.
function ClosingCard({ c }: { c: ClosingPreview }) {
  const entries = Object.entries(c.data || {}).filter(([, v]) => v !== null && v !== '' && v !== undefined);
  if (c.detected) {
    return (
      <Alert severity={c.sheet_configured ? 'success' : 'warning'} icon={<ReceiptLongIcon fontSize="small" />}
        sx={{ mt: 0.5, py: 0.25, '& .MuiAlert-message': { py: 0.5 } }}>
        <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
          Order terdeteksi lengkap{c.sheet_configured ? ' — akan tercatat ke Google Sheets' : ''}
        </Typography>
        {entries.map(([k, v]) => (
          <Typography key={k} variant="caption" sx={{ display: 'block', lineHeight: 1.4 }}>
            • {k}: <b>{String(v)}</b>
          </Typography>
        ))}
        {!c.sheet_configured && (
          <Typography variant="caption" sx={{ display: 'block', mt: 0.25, fontStyle: 'italic' }}>
            Google Sheets belum diatur — di WhatsApp asli order ini TIDAK akan tercatat sampai sync diaktifkan.
          </Typography>
        )}
        <Typography variant="caption" sx={{ display: 'block', mt: 0.25, opacity: 0.7 }}>
          (Pratinjau simulator — belum benar-benar disimpan)
        </Typography>
      </Alert>
    );
  }
  // Sebagian data terbaca tapi belum lengkap.
  return (
    <Alert severity="info" icon={<ReceiptLongIcon fontSize="small" />}
      sx={{ mt: 0.5, py: 0.25, '& .MuiAlert-message': { py: 0.5 } }}>
      <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
        Niat order terdeteksi, data belum lengkap
      </Typography>
      {entries.length > 0 && entries.map(([k, v]) => (
        <Typography key={k} variant="caption" sx={{ display: 'block', lineHeight: 1.4 }}>
          • {k}: <b>{String(v)}</b>
        </Typography>
      ))}
      {c.missing?.length > 0 && (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>
          Masih kurang: <b>{c.missing.join(', ')}</b>
        </Typography>
      )}
    </Alert>
  );
}

export default function TestChatPanel({ agentId }: { agentId: number }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const testChat = useTestChat(agentId);

  const send = async () => {
    const text = input.trim();
    if (!text || testChat.isPending) return;
    const history = msgs.map(m => ({ role: m.role, text: m.text }));
    setMsgs(m => [...m, { role: 'user', text }]);
    setInput('');
    try {
      const res = await testChat.mutateAsync({ message: text, history });
      setMsgs(m => [...m, { role: 'bot', text: res.reply, escalate: res.escalate, model: res.model, closing: res.closing }]);
    } catch {
      setMsgs(m => [...m, { role: 'bot', text: 'Gagal memanggil AI.' }]);
    }
  };

  return (
    <Box>
      <PageHeader title="Simulasi AI"
        subtitle="Uji jawaban AI tanpa perlu konek WhatsApp." />
      <Card>
        <CardContent>
          <Box sx={{ minHeight: 300, maxHeight: 430, overflowY: 'auto', mb: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {msgs.length === 0 && (
              <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 5 }}>
                Ketik pesan seperti calon pembeli, lihat bagaimana AI menjawab.
              </Typography>
            )}
            {msgs.map((m, i) => (
              <Box key={i} sx={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <Box sx={{ px: 1.25, py: 0.75, borderRadius: 1.5, bgcolor: m.role === 'user' ? 'primary.main' : '#eceff1', color: m.role === 'user' ? '#fff' : 'text.primary', whiteSpace: 'pre-wrap', fontSize: '0.88rem', lineHeight: 1.45 }}>
                  {renderWithLinks(m.text)}
                </Box>
                {m.escalate && <Chip label="Bot ragu, dialihkan ke manusia" size="small" color="warning" sx={{ mt: 0.5 }} />}
                {m.role === 'bot' && m.closing && <ClosingCard c={m.closing} />}
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
