import { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Card, List, ListItemButton, ListItemText, TextField, IconButton,
  Stack, Chip, Button, Divider, CircularProgress,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { useContacts, useConversation, useSendMessage, useResumeBot } from '../hooks';

export default function InboxPanel({ agentId }: { agentId: number }) {
  const { data: contacts, isLoading } = useContacts(agentId);
  const [sender, setSender] = useState('');
  const { data: convo } = useConversation(agentId, sender);
  const sendMsg = useSendMessage(agentId);
  const resumeBot = useResumeBot(agentId);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Pilih kontak pertama otomatis.
  useEffect(() => {
    if (!sender && contacts && contacts.length) setSender(contacts[0].sender);
  }, [contacts, sender]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [convo]);

  const send = async () => {
    const m = text.trim();
    if (!m || !sender) return;
    setText('');
    await sendMsg.mutateAsync({ to: sender, message: m });
  };

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>Inbox</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Baca dan balas pelanggan langsung dari sini. Saat kamu mengetik balasan, bot otomatis berhenti untuk kontak itu.
      </Typography>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ height: { md: 540 } }}>
        {/* Daftar kontak */}
        <Card sx={{ width: { xs: '100%', md: 300 }, flexShrink: 0, overflowY: 'auto' }}>
          <List dense disablePadding>
            {contacts?.length === 0 && (
              <Typography color="text.secondary" sx={{ p: 2 }}>Belum ada percakapan.</Typography>
            )}
            {contacts?.map(ct => (
              <ListItemButton key={ct.sender} selected={ct.sender === sender} onClick={() => setSender(ct.sender)}>
                <ListItemText
                  primary={<Typography sx={{ fontWeight: 600 }}>+{ct.sender}</Typography>}
                  secondary={new Date(ct.last_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                />
                {ct.needs_human && <Chip label="Perlu kamu" size="small" color="warning" />}
              </ListItemButton>
            ))}
          </List>
        </Card>

        {/* Percakapan */}
        <Card sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 400 }}>
          {!sender ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography color="text.secondary">Pilih kontak untuk melihat percakapan.</Typography>
            </Box>
          ) : (
            <>
              <Stack direction="row" sx={{ p: 1.5, alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography sx={{ fontWeight: 700 }}>+{sender}</Typography>
                {convo?.needs_human ? (
                  <Button size="small" startIcon={<SmartToyIcon />} onClick={() => resumeBot.mutate(sender)}>
                    Aktifkan bot
                  </Button>
                ) : (
                  <Chip label="Bot aktif" size="small" color="success" variant="outlined" />
                )}
              </Stack>
              <Divider />
              <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1, bgcolor: '#f7f9fa' }}>
                {convo?.data.map(m => (
                  <Box key={m.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {m.message && (
                      <Bubble side="left" bg="#fff" text={m.message} />
                    )}
                    {m.reply && (
                      <Bubble side="right" bg={m.from_human ? '#1F8A50' : '#dcf8c6'} color={m.from_human ? '#fff' : 'inherit'}
                        text={m.reply} tag={m.from_human ? 'CS' : 'Bot'} />
                    )}
                  </Box>
                ))}
                <div ref={bottomRef} />
              </Box>
              <Divider />
              <Stack direction="row" spacing={1} sx={{ p: 1.5 }}>
                <TextField fullWidth size="small" placeholder="Balas pelanggan…" value={text}
                  onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
                <IconButton color="primary" onClick={send} disabled={sendMsg.isPending}><SendIcon /></IconButton>
              </Stack>
            </>
          )}
        </Card>
      </Stack>
    </Box>
  );
}

function Bubble({ side, bg, color, text, tag }: { side: 'left' | 'right'; bg: string; color?: string; text: string; tag?: string }) {
  return (
    <Box sx={{ alignSelf: side === 'right' ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
      {tag && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right' }}>{tag}</Typography>}
      <Box sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: bg, color: color || 'text.primary', whiteSpace: 'pre-wrap', boxShadow: '0 1px 1px rgba(0,0,0,0.08)' }}>
        {text}
      </Box>
    </Box>
  );
}
