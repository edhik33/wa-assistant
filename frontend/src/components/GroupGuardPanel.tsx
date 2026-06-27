import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControlLabel, Stack, Switch, Tab, Tabs,
  TextField, Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import GroupsIcon from '@mui/icons-material/GroupsOutlined';
import ShieldIcon from '@mui/icons-material/ShieldOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import PageHeader from './PageHeader';
import {
  useManagedGroups, useGroupConfig, useSaveGroupConfig, useGroupModeration,
  useConfirmKick, useDismissModeration,
} from '../hooks';
import type { GroupGuardConfig, WAGroup } from '../types';

export default function GroupGuardPanel({ agentId }: { agentId: number }) {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <PageHeader
        title="Penjaga Grup"
        subtitle="Moderasi anti-spam untuk grup yang diikuti nomor ini. Aksi (hapus/keluarkan) hanya jalan di grup tempat Wai menjadi admin."
      />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Grup" />
        <Tab label="Aktivitas" />
      </Tabs>
      {tab === 0 ? <GroupList agentId={agentId} /> : <ModerationFeed agentId={agentId} />}
    </Box>
  );
}

function GroupList({ agentId }: { agentId: number }) {
  const { data: groups, isLoading, isError, error, refetch, isFetching } = useManagedGroups(agentId);
  const [editing, setEditing] = useState<WAGroup | null>(null);

  const adminCount = groups?.filter(g => g.bot_is_admin).length ?? 0;
  const total = groups?.length ?? 0;

  return (
    <Box>
      <Alert severity="info" icon={<ShieldIcon fontSize="small" />} sx={{ mb: 2 }}>
        <Typography variant="body2">
          Status admin terdeteksi otomatis. Jadikan Wai admin di grup yang ingin dimoderasi, lalu klik grupnya untuk mengatur aturan anti-spam.
        </Typography>
      </Alert>

      <Stack direction="row" sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          <Chip size="small" label={`${total} grup`} variant="outlined" />
          <Chip size="small" color="success" label={`${adminCount} sebagai admin`} variant="outlined" />
          {total - adminCount > 0 && <Chip size="small" color="warning" label={`${total - adminCount} bukan admin`} variant="outlined" />}
        </Stack>
        <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={() => refetch()} disabled={isFetching}>Segarkan</Button>
      </Stack>

      {isLoading && <Stack sx={{ py: 6, alignItems: 'center' }}><CircularProgress /></Stack>}
      {isError && <Alert severity="warning">Gagal memuat grup. Pastikan WhatsApp tersambung.{error instanceof Error && error.message ? ` (${error.message})` : ''}</Alert>}
      {!isLoading && !isError && total === 0 && <Alert severity="info">Belum ada grup yang diikuti nomor ini.</Alert>}

      {!isLoading && !isError && total > 0 && (
        <Stack spacing={1}>
          {groups!.map(g => (
            <Card key={g.jid} variant="outlined">
              <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <GroupsIcon fontSize="small" color="action" />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.name || g.jid}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{g.participants} anggota</Typography>
                  </Box>
                  {g.bot_is_admin
                    ? <Chip size="small" color="success" label="Wai admin" />
                    : <Chip size="small" color="warning" variant="outlined" label="Wai bukan admin" />}
                  <Button size="small" variant="outlined" startIcon={<TuneIcon />} onClick={() => setEditing(g)}>Atur</Button>
                </Stack>
                {!g.bot_is_admin && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, pl: 3.5 }}>
                    Jadikan Wai admin agar aturan bisa menghapus spam &amp; mengeluarkan anggota. Aturan tetap bisa disimpan dulu.
                  </Typography>
                )}
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {editing && (
        <ConfigDialog agentId={agentId} group={editing} onClose={() => setEditing(null)} />
      )}
    </Box>
  );
}

function ConfigDialog({ agentId, group, onClose }: { agentId: number; group: WAGroup; onClose: () => void }) {
  const { data, isLoading } = useGroupConfig(agentId, group.jid);
  const save = useSaveGroupConfig(agentId);
  const [form, setForm] = useState<GroupGuardConfig | null>(null);

  useEffect(() => {
    if (data) setForm({ ...data, group_jid: group.jid, group_name: group.name || data.group_name });
  }, [data, group.jid, group.name]);

  const set = (patch: Partial<GroupGuardConfig>) => setForm(f => (f ? { ...f, ...patch } : f));

  const onSave = async () => {
    if (!form) return;
    await save.mutateAsync(form);
    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Aturan moderasi — {group.name || group.jid}</DialogTitle>
      <DialogContent dividers>
        {isLoading || !form ? (
          <Stack sx={{ py: 4, alignItems: 'center' }}><CircularProgress /></Stack>
        ) : (
          <Stack spacing={1.5}>
            {!group.bot_is_admin && (
              <Alert severity="warning" icon={false}>
                Wai belum admin di grup ini. Aturan tersimpan, tapi hapus/keluarkan baru jalan setelah Wai dijadikan admin.
              </Alert>
            )}
            <FormControlLabel
              control={<Switch checked={form.enabled} onChange={e => set({ enabled: e.target.checked })} />}
              label={<Typography variant="body2" sx={{ fontWeight: 700 }}>Aktifkan penjaga di grup ini</Typography>}
            />
            <Divider />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Deteksi spam</Typography>
            <FormControlLabel control={<Switch checked={form.block_links} onChange={e => set({ block_links: e.target.checked })} />} label="Blokir pesan berisi tautan/link" />
            <FormControlLabel control={<Switch checked={form.block_phones} onChange={e => set({ block_phones: e.target.checked })} />} label="Blokir pesan berisi nomor telepon" />
            <TextField
              size="small" label="Kata terlarang (pisah baris/koma)" value={form.block_words} multiline minRows={2}
              onChange={e => set({ block_words: e.target.value })} placeholder={'judi\npinjol\npromo'}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField type="number" size="small" label="Anti-flood: jml pesan" value={form.flood_count}
                onChange={e => set({ flood_count: Math.max(0, Number(e.target.value)) })} helperText="0 = mati" sx={{ width: { xs: '100%', sm: 170 } }} />
              <TextField type="number" size="small" label="dalam (detik)" value={form.flood_window_sec}
                onChange={e => set({ flood_window_sec: Math.max(1, Number(e.target.value)) })} sx={{ width: { xs: '100%', sm: 150 } }} />
            </Stack>
            <Divider />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Tindakan saat spam</Typography>
            <FormControlLabel control={<Switch checked={form.delete_spam} onChange={e => set({ delete_spam: e.target.checked })} />} label="Hapus pesan spam otomatis (butuh admin)" />
            <FormControlLabel control={<Switch checked={form.flag_for_kick} onChange={e => set({ flag_for_kick: e.target.checked })} />} label="Tandai untuk dikonfirmasi keluarkan (tab Aktivitas)" />
            <FormControlLabel control={<Switch color="warning" checked={form.auto_kick} onChange={e => set({ auto_kick: e.target.checked })} />}
              label={<Typography variant="body2">Keluarkan otomatis tanpa konfirmasi <Typography component="span" variant="caption" color="warning.main">(berisiko)</Typography></Typography>} />
            <Divider />
            <TextField size="small" label="Nomor dikecualikan (pisah baris/koma)" value={form.allow_numbers} multiline minRows={1}
              onChange={e => set({ allow_numbers: e.target.value })} placeholder="6281234567890" helperText="Admin grup otomatis dikecualikan." />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Batal</Button>
        <Button variant="contained" onClick={onSave} disabled={!form || save.isPending}>Simpan</Button>
      </DialogActions>
    </Dialog>
  );
}

function ModerationFeed({ agentId }: { agentId: number }) {
  const { data: rows, isLoading, isError, refetch, isFetching } = useGroupModeration(agentId);
  const confirmKick = useConfirmKick(agentId);
  const dismiss = useDismissModeration(agentId);

  const actionChip = (a: string) => {
    const map: Record<string, { label: string; color: 'default' | 'success' | 'error' | 'warning' }> = {
      deleted: { label: 'Dihapus', color: 'success' },
      kicked: { label: 'Dikeluarkan', color: 'error' },
      flagged: { label: 'Ditandai', color: 'warning' },
      warned: { label: 'Diperingatkan', color: 'warning' },
      dismissed: { label: 'Diabaikan', color: 'default' },
    };
    const m = map[a] || { label: a, color: 'default' as const };
    return <Chip size="small" color={m.color} label={m.label} variant="outlined" />;
  };

  return (
    <Box>
      <Stack direction="row" sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary">Aktivitas moderasi terbaru. Item "menunggu konfirmasi" bisa kamu keluarkan atau abaikan.</Typography>
        <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={() => refetch()} disabled={isFetching}>Segarkan</Button>
      </Stack>

      {isLoading && <Stack sx={{ py: 6, alignItems: 'center' }}><CircularProgress /></Stack>}
      {isError && <Alert severity="warning">Gagal memuat aktivitas.</Alert>}
      {!isLoading && !isError && (rows?.length ?? 0) === 0 && <Alert severity="info">Belum ada aktivitas moderasi.</Alert>}

      <Stack spacing={1}>
        {rows?.map(r => (
          <Card key={r.id} variant="outlined">
            <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                {actionChip(r.action)}
                {r.status === 'pending' && <Chip size="small" color="warning" label="menunggu konfirmasi" />}
                <Typography variant="caption" color="text.secondary">{new Date(r.created_at).toLocaleString('id-ID')}</Typography>
              </Stack>
              <Typography variant="body2">
                <b>{r.sender_name || r.sender}</b> di <b>{r.group_name || r.group_jid}</b> · alasan: {r.reason}
              </Typography>
              {r.excerpt && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, fontStyle: 'italic', wordBreak: 'break-word' }}>
                  "{r.excerpt}"
                </Typography>
              )}
              {r.status === 'pending' && (
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button size="small" color="error" variant="contained"
                    disabled={confirmKick.isPending}
                    onClick={() => confirmKick.mutate(r.id)}>Keluarkan</Button>
                  <Button size="small" variant="outlined"
                    disabled={dismiss.isPending}
                    onClick={() => dismiss.mutate(r.id)}>Abaikan</Button>
                </Stack>
              )}
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
